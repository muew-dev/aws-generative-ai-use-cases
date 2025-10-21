import * as cdk from 'aws-cdk-lib';
import * as certificateManager from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { AlbConfig } from '../../constants';

export interface AlbProps {
  readonly vpc: ec2.IVpc;
  readonly publicSubnets: ec2.ISubnet[];
  readonly loadBalancerName: string;
}

export interface AlbTargetProps {
  readonly service: ecs.IBaseService;
  readonly containerName: string;
  readonly containerPort: number;
  readonly priority: number;
  readonly pathPattern: string;
  readonly healthCheckPath: string;
  readonly authRequired: boolean;
}

export interface CognitoAuthConfig {
  readonly userPool: cognito.IUserPool;
  readonly userPoolClient: cognito.IUserPoolClient;
  readonly userPoolDomain: cognito.IUserPoolDomain;
}

/**
 * Application Load Balancer L2 Construct
 * Supports Cognito OIDC authentication and ECS service targets
 */
export class Alb extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly httpsListener: elbv2.ApplicationListener;
  public readonly securityGroup: ec2.SecurityGroup;
  private cognitoAuthConfig?: CognitoAuthConfig;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    // ALB用セキュリティグループ
    this.securityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: false,
    });

    // HTTPS (443) インバウンド許可（NLB TLS Passthroughと直接アクセス）
    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from NLB and internet'
    );

    // VPC内のECSサービスへのアウトバウンドアクセス許可
    this.securityGroup.addEgressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'Allow outbound traffic to VPC (ECS services)'
    );

    // Application Load Balancer作成
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      'ApplicationLoadBalancer',
      {
        vpc: props.vpc,
        internetFacing: true,
        loadBalancerName: props.loadBalancerName,
        vpcSubnets: {
          subnets: props.publicSubnets,
        },
        securityGroup: this.securityGroup,
      }
    );

    // HTTPSリスナー（Cognito OIDC認証必須のため）
    this.httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [], // 証明書は後でsetCertificateで追加
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        messageBody: 'Not Found',
      }),
    });
  }

  /**
   * Cognito認証設定を追加
   */
  public setCognitoAuth(authConfig: CognitoAuthConfig): void {
    this.cognitoAuthConfig = authConfig;
  }

  /**
   * SSL/TLS証明書を設定（Cognito OIDC認証のため必須）
   */
  public setCertificate(certificate: certificateManager.ICertificate): void {
    this.httpsListener.addCertificates('DefaultCert', [certificate]);
  }

  /**
   * ECSサービスをターゲットとして追加
   */
  public addEcsTarget(props: AlbTargetProps): elbv2.ApplicationTargetGroup {
    const listener = this.httpsListener; // HTTPS専用リスナーを使用（Cognito認証のため）

    // Target Group作成
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      `TargetGroup${props.pathPattern.replace(/[^a-zA-Z0-9]/g, '')}`,
      {
        vpc: this.loadBalancer.vpc!,
        port: props.containerPort,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          enabled: true,
          path: props.healthCheckPath,
          protocol: elbv2.Protocol.HTTP,
          port: props.containerPort.toString(),
          healthyHttpCodes: '200',
          interval: cdk.Duration.seconds(
            AlbConfig.HEALTH_CHECK.INTERVAL_SECONDS
          ),
          timeout: cdk.Duration.seconds(AlbConfig.HEALTH_CHECK.TIMEOUT_SECONDS),
          healthyThresholdCount: AlbConfig.HEALTH_CHECK.HEALTHY_THRESHOLD,
          unhealthyThresholdCount: AlbConfig.HEALTH_CHECK.UNHEALTHY_THRESHOLD,
        },
        deregistrationDelay: cdk.Duration.seconds(
          AlbConfig.HEALTH_CHECK.DEREGISTRATION_DELAY_SECONDS
        ),
      }
    );

    // ECSサービスのタスクをTarget Groupに自動登録
    (props.service as ecs.FargateService).attachToApplicationTargetGroup(
      targetGroup
    );

    // リスナールール作成
    let action: elbv2.ListenerAction;

    // 認証が必要で、Cognito設定がある場合は認証アクション with forward
    if (props.authRequired && this.cognitoAuthConfig) {
      const clientSecret =
        this.cognitoAuthConfig.userPoolClient.userPoolClientSecret;
      if (!clientSecret) {
        throw new Error(
          'Cognito User Pool Client Secret is required for ALB OIDC authentication'
        );
      }

      action = elbv2.ListenerAction.authenticateOidc({
        issuer: `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${this.cognitoAuthConfig.userPool.userPoolId}`,
        clientId: this.cognitoAuthConfig.userPoolClient.userPoolClientId,
        clientSecret: clientSecret,
        authorizationEndpoint: `https://${this.cognitoAuthConfig.userPoolDomain.domainName}.auth.${cdk.Stack.of(this).region}.amazoncognito.com/oauth2/authorize`,
        tokenEndpoint: `https://${this.cognitoAuthConfig.userPoolDomain.domainName}.auth.${cdk.Stack.of(this).region}.amazoncognito.com/oauth2/token`,
        userInfoEndpoint: `https://${this.cognitoAuthConfig.userPoolDomain.domainName}.auth.${cdk.Stack.of(this).region}.amazoncognito.com/oauth2/userInfo`,
        onUnauthenticatedRequest: elbv2.UnauthenticatedAction.AUTHENTICATE,
        next: elbv2.ListenerAction.forward([targetGroup]),
      });
    } else {
      // 認証なしの場合は直接転送
      action = elbv2.ListenerAction.forward([targetGroup]);
    }

    new elbv2.ApplicationListenerRule(
      this,
      `ListenerRule${props.pathPattern.replace(/[^a-zA-Z0-9]/g, '')}`,
      {
        listener,
        priority: props.priority,
        conditions: [elbv2.ListenerCondition.pathPatterns([props.pathPattern])],
        action,
      }
    );

    return targetGroup;
  }

  /**
   * ALBのセキュリティグループを取得
   */
  public getSecurityGroup(): ec2.ISecurityGroup {
    return this.securityGroup;
  }

  /**
   * ECSサービスのセキュリティグループにALBからのアクセスを許可
   */
  public allowConnectionsTo(
    targetSecurityGroup: ec2.ISecurityGroup,
    port: number
  ): void {
    targetSecurityGroup.addIngressRule(
      this.securityGroup,
      ec2.Port.tcp(port),
      'Allow traffic from ALB'
    );
  }
}
