import * as cdk from 'aws-cdk-lib';
import * as certificateManager from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ApplicationLoadBalancerProps {
  readonly vpc: ec2.IVpc;
  readonly publicSubnets: ec2.ISubnet[];
  readonly loadBalancerName: string;
  readonly internetFacing?: boolean;
  readonly enableDeletionProtection?: boolean;
  readonly idleTimeoutSeconds?: number;
}

export interface TargetGroupProps {
  readonly targetGroupName: string;
  readonly port: number;
  readonly protocol?: elbv2.ApplicationProtocol;
  readonly healthCheckPath?: string;
  readonly healthCheckPort?: string;
  readonly healthCheckProtocol?: elbv2.Protocol;
  readonly healthCheckTimeoutSeconds?: number;
  readonly healthyThresholdCount?: number;
  readonly unhealthyThresholdCount?: number;
  readonly healthCheckIntervalSeconds?: number;
  readonly targetType?: elbv2.TargetType;
}

export interface ListenerRuleProps {
  readonly targetGroup: elbv2.IApplicationTargetGroup;
  readonly priority: number;
  readonly conditions?: elbv2.ListenerCondition[];
  readonly pathPattern?: string;
  readonly hostHeader?: string;
}

/**
 * Application Load Balancer L2 Construct
 * 基本的なALB + Listener + Target Groupのみの純粋なL2 Construct
 * Cognito認証統合や複雑なルーティングロジックは含まず
 */
export class ApplicationLoadBalancer extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  private _httpListener?: elbv2.ApplicationListener;
  private _httpsListener?: elbv2.ApplicationListener;
  private readonly props: ApplicationLoadBalancerProps;

  public get httpListener(): elbv2.ApplicationListener | undefined {
    return this._httpListener;
  }

  public get httpsListener(): elbv2.ApplicationListener | undefined {
    return this._httpsListener;
  }

  constructor(
    scope: Construct,
    id: string,
    props: ApplicationLoadBalancerProps
  ) {
    super(scope, id);
    this.props = props;

    // Application Load Balancer作成
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: props.internetFacing ?? true,
      loadBalancerName: props.loadBalancerName,
      vpcSubnets: {
        subnets: props.publicSubnets,
      },
      deletionProtection: props.enableDeletionProtection ?? false,
      idleTimeout: props.idleTimeoutSeconds
        ? cdk.Duration.seconds(props.idleTimeoutSeconds)
        : undefined,
    });
  }

  /**
   * Load Balancer名を取得
   */
  public getLoadBalancerName(): string {
    return this.props.loadBalancerName;
  }

  /**
   * Load Balancer ARNを取得
   */
  public getLoadBalancerArn(): string {
    return this.loadBalancer.loadBalancerArn;
  }

  /**
   * Load Balancer DNS名を取得
   */
  public getLoadBalancerDnsName(): string {
    return this.loadBalancer.loadBalancerDnsName;
  }

  /**
   * Load Balancer Canonical Hosted Zone IDを取得
   */
  public getLoadBalancerCanonicalHostedZoneId(): string {
    return this.loadBalancer.loadBalancerCanonicalHostedZoneId;
  }

  /**
   * VPCを取得
   */
  public getVpc(): ec2.IVpc {
    return this.props.vpc;
  }

  /**
   * Internet Facing状態を取得
   */
  public isInternetFacing(): boolean {
    return this.props.internetFacing ?? true;
  }

  /**
   * HTTP Listenerを追加
   */
  public addHttpListener(port: number = 80): elbv2.ApplicationListener {
    if (this.httpListener) {
      throw new Error('HTTP Listener is already added');
    }

    const listener = this.loadBalancer.addListener('HttpListener', {
      port: port,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    this._httpListener = listener;
    return listener;
  }

  /**
   * HTTPS Listenerを追加
   */
  public addHttpsListener(
    port: number = 443,
    certificates?: certificateManager.ICertificate[]
  ): elbv2.ApplicationListener {
    if (this.httpsListener) {
      throw new Error('HTTPS Listener is already added');
    }

    const listener = this.loadBalancer.addListener('HttpsListener', {
      port: port,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: certificates,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    this._httpsListener = listener;
    return listener;
  }

  /**
   * Target Groupを作成
   */
  public createTargetGroup(
    id: string,
    targetGroupProps: TargetGroupProps
  ): elbv2.ApplicationTargetGroup {
    return new elbv2.ApplicationTargetGroup(this, id, {
      vpc: this.props.vpc,
      targetGroupName: targetGroupProps.targetGroupName,
      port: targetGroupProps.port,
      protocol: targetGroupProps.protocol ?? elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: targetGroupProps.healthCheckPath ?? '/',
        port: targetGroupProps.healthCheckPort ?? 'traffic-port',
        protocol: targetGroupProps.healthCheckProtocol ?? elbv2.Protocol.HTTP,
        timeout: targetGroupProps.healthCheckTimeoutSeconds
          ? cdk.Duration.seconds(targetGroupProps.healthCheckTimeoutSeconds)
          : undefined,
        healthyThresholdCount: targetGroupProps.healthyThresholdCount ?? 2,
        unhealthyThresholdCount: targetGroupProps.unhealthyThresholdCount ?? 5,
        interval: targetGroupProps.healthCheckIntervalSeconds
          ? cdk.Duration.seconds(targetGroupProps.healthCheckIntervalSeconds)
          : undefined,
      },
      targetType: targetGroupProps.targetType ?? elbv2.TargetType.IP,
    });
  }

  /**
   * Listenerにルールを追加
   */
  public addListenerRule(
    listener: elbv2.ApplicationListener,
    id: string,
    ruleProps: ListenerRuleProps
  ): elbv2.ApplicationListenerRule {
    let conditions = ruleProps.conditions;

    // パスパターンまたはホストヘッダーが指定されている場合、条件を生成
    if (!conditions) {
      conditions = [];

      if (ruleProps.pathPattern) {
        conditions.push(
          elbv2.ListenerCondition.pathPatterns([ruleProps.pathPattern])
        );
      }

      if (ruleProps.hostHeader) {
        conditions.push(
          elbv2.ListenerCondition.hostHeaders([ruleProps.hostHeader])
        );
      }
    }

    return new elbv2.ApplicationListenerRule(this, id, {
      listener: listener,
      priority: ruleProps.priority,
      conditions: conditions,
      action: elbv2.ListenerAction.forward([ruleProps.targetGroup]),
    });
  }

  /**
   * Security Groupを作成（ALB用）
   */
  public createSecurityGroup(
    id: string,
    groupName: string,
    description: string,
    allowAllOutbound?: boolean
  ): ec2.SecurityGroup {
    return new ec2.SecurityGroup(this, id, {
      vpc: this.props.vpc,
      securityGroupName: groupName,
      description: description,
      allowAllOutbound: allowAllOutbound ?? true,
    });
  }

  /**
   * Security Groupを設定
   */
  public setSecurityGroups(/* securityGroups: ec2.ISecurityGroup[] */): void {
    // Note: ALBのSecurity Groupは作成後に変更できないため、
    // 実際の実装では新しいALBを作成する必要があります
    // このメソッドは将来の拡張用として定義
    throw new Error(
      'Security Groups cannot be modified after ALB creation. Create a new ALB instead.'
    );
  }

  /**
   * Security Groupを追加（将来の拡張用）
   */
  public addSecurityGroup(/* securityGroup: ec2.ISecurityGroup */): void {
    // Note: CDKの制約により、作成後のSecurity Group追加は不可
    throw new Error(
      'Security Groups cannot be added after ALB creation. Use createSecurityGroup instead.'
    );
  }

  /**
   * ALB用のCloudWatchメトリクス参照情報を取得
   */
  public getMetricsReference(): {
    namespace: string;
    dimensionKeys: string[];
    dimensions: { [key: string]: string };
  } {
    return {
      namespace: 'AWS/ApplicationELB',
      dimensionKeys: ['LoadBalancer'],
      dimensions: {
        LoadBalancer: this.loadBalancer.loadBalancerFullName,
      },
    };
  }

  /**
   * Target Group用のCloudWatchメトリクス参照情報を取得
   */
  public getTargetGroupMetricsReference(
    targetGroup: elbv2.ApplicationTargetGroup
  ): {
    namespace: string;
    dimensionKeys: string[];
    dimensions: { [key: string]: string };
  } {
    return {
      namespace: 'AWS/ApplicationELB',
      dimensionKeys: ['TargetGroup', 'LoadBalancer'],
      dimensions: {
        TargetGroup: targetGroup.targetGroupFullName,
        LoadBalancer: this.loadBalancer.loadBalancerFullName,
      },
    };
  }

  /**
   * Access Logsを有効化
   */
  public enableAccessLogs(bucket: s3.IBucket, prefix?: string): void {
    this.loadBalancer.logAccessLogs(bucket, prefix);
  }

  /**
   * ALBの属性を取得
   */
  public getAttributes(): { [key: string]: string | number | boolean } {
    return {
      loadBalancerName: this.props.loadBalancerName,
      internetFacing: this.props.internetFacing ?? true,
      deletionProtection: this.props.enableDeletionProtection ?? false,
      idleTimeoutSeconds: this.props.idleTimeoutSeconds ?? 60,
    };
  }
}
