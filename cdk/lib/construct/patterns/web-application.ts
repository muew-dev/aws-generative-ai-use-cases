import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { Alb } from '../aws-resources';
import { FargateWorkload } from './fargate-workload';

export interface WebApplicationProps {
  readonly vpc: ec2.IVpc;
  readonly publicSubnets: ec2.ISubnet[];
  readonly privateSubnets: ec2.ISubnet[];
  readonly domain: string;
  readonly certificate: acm.ICertificate;
  readonly hostedZone?: route53.IHostedZone;
  readonly loadBalancerName: string;
  readonly cognitoAuthConfig: {
    readonly userPool: cognito.IUserPool;
    readonly userPoolClient: cognito.IUserPoolClient;
    readonly userPoolDomain: cognito.IUserPoolDomain;
  };
}

export interface WebApplicationWorkloadProps {
  readonly serviceName: string;
  readonly taskDefinitionProps: {
    family: string;
    cpu: number;
    memoryLimitMiB: number;
  };
  readonly containerProps: {
    containerName: string;
    imageUri: string;
    portMappings: ecs.PortMapping[];
    environment: { [key: string]: string };
    secrets: { [key: string]: ecs.Secret };
  };
  readonly autoScaling: {
    readonly minCapacity: number;
    readonly maxCapacity: number;
    readonly targetCpuUtilization: number;
    readonly scaleInCooldownMinutes: number;
    readonly scaleOutCooldownMinutes: number;
  };
  readonly routing: {
    readonly priority: number;
    readonly pathPattern: string;
    readonly healthCheckPath: string;
    readonly authRequired: boolean;
  };
  readonly logRetentionDays?: logs.RetentionDays;
  readonly enableExecuteCommand?: boolean;
}

/**
 * Web Application L3 Pattern Construct
 * ALB + ECS + Cognito認証の統合パターン
 * 完全なWebアプリケーション実行環境を提供
 */
export class WebApplication extends Construct {
  public readonly alb: Alb;
  public readonly workloads: Map<string, FargateWorkload> = new Map();
  public readonly ecsCluster: ecs.ICluster;

  private readonly props: WebApplicationProps;

  constructor(scope: Construct, id: string, props: WebApplicationProps, ecsCluster: ecs.ICluster) {
    super(scope, id);
    this.props = props;
    this.ecsCluster = ecsCluster;

    // Application Load Balancer作成
    this.alb = new Alb(this, 'ALB', {
      vpc: props.vpc,
      publicSubnets: props.publicSubnets,
      loadBalancerName: props.loadBalancerName,
    });

    // Cognito認証設定
    this.alb.setCognitoAuth({
      userPool: props.cognitoAuthConfig.userPool,
      userPoolClient: props.cognitoAuthConfig.userPoolClient,
      userPoolDomain: props.cognitoAuthConfig.userPoolDomain,
    });

    // SSL証明書設定
    this.alb.setCertificate(props.certificate);
  }

  /**
   * ワークロードを追加
   */
  public addWorkload(id: string, workloadProps: WebApplicationWorkloadProps): FargateWorkload {
    // FargateWorkloadを作成
    const workload = new FargateWorkload(this, `${id}Workload`, {
      cluster: this.ecsCluster,
      serviceName: workloadProps.serviceName,
      taskDefinitionProps: workloadProps.taskDefinitionProps,
      containerProps: workloadProps.containerProps,
      autoScaling: workloadProps.autoScaling,
      logRetentionDays: workloadProps.logRetentionDays,
      enableExecuteCommand: workloadProps.enableExecuteCommand,
    });

    // ALBターゲットとして追加
    this.alb.addEcsTarget({
      service: workload.service,
      containerName: workloadProps.containerProps.containerName,
      containerPort: workloadProps.containerProps.portMappings[0].containerPort,
      priority: workloadProps.routing.priority,
      pathPattern: workloadProps.routing.pathPattern,
      healthCheckPath: workloadProps.routing.healthCheckPath,
      authRequired: workloadProps.routing.authRequired,
    });

    // セキュリティグループ接続許可
    this.alb.allowConnectionsTo(
      workload.getSecurityGroup(),
      workloadProps.containerProps.portMappings[0].containerPort
    );

    // ワークロードをマップに保存
    this.workloads.set(workloadProps.serviceName, workload);

    return workload;
  }

  /**
   * Route53 Aレコードを作成（オプション）
   */
  public createDomainRecord(staticIpAddresses: string[]): route53.ARecord | undefined {
    if (!this.props.hostedZone) {
      return undefined;
    }

    return new route53.ARecord(this, 'DomainRecord', {
      zone: this.props.hostedZone,
      target: route53.RecordTarget.fromIpAddresses(...staticIpAddresses),
      ttl: cdk.Duration.minutes(5),
    });
  }

  /**
   * 指定されたワークロードを取得
   */
  public getWorkload(serviceName: string): FargateWorkload | undefined {
    return this.workloads.get(serviceName);
  }

  /**
   * すべてのワークロードを取得
   */
  public getAllWorkloads(): FargateWorkload[] {
    return Array.from(this.workloads.values());
  }

  /**
   * ALBのDNS名を取得
   */
  public getLoadBalancerDnsName(): string {
    return this.alb.loadBalancer.loadBalancerDnsName;
  }

  /**
   * ALBのARNを取得
   */
  public getLoadBalancerArn(): string {
    return this.alb.loadBalancer.loadBalancerArn;
  }

  /**
   * ドメイン名を取得
   */
  public getDomainName(): string {
    return this.props.domain;
  }

  /**
   * アプリケーションURLを取得
   */
  public getApplicationUrl(): string {
    return `https://${this.props.domain}/`;
  }

  /**
   * Cognito ログインURLを取得
   */
  public getCognitoLoginUrl(): string {
    const userPoolClientId = this.props.cognitoAuthConfig.userPoolClient.userPoolClientId;
    const userPoolDomainName = this.props.cognitoAuthConfig.userPoolDomain.domainName;
    const region = cdk.Stack.of(this).region;
    return `https://${userPoolDomainName}.auth.${region}.amazoncognito.com/login?client_id=${userPoolClientId}&response_type=code&scope=openid+email+profile&redirect_uri=https://${this.props.domain}/oauth2/idpresponse`;
  }

  /**
   * セキュリティグループ間の接続を許可
   */
  public allowConnectionBetween(
    sourceServiceName: string,
    targetServiceName: string,
    port: number,
    description?: string
  ): void {
    const sourceWorkload = this.workloads.get(sourceServiceName);
    const targetWorkload = this.workloads.get(targetServiceName);

    if (!sourceWorkload || !targetWorkload) {
      throw new Error(`Service not found: ${sourceServiceName} or ${targetServiceName}`);
    }

    targetWorkload.allowConnectionsFrom(
      sourceWorkload.getSecurityGroup(),
      port,
      description ?? `Allow ${sourceServiceName} to ${targetServiceName} on port ${port}`
    );
  }

  /**
   * 外部データベースへの接続許可
   */
  public allowDatabaseConnection(
    serviceName: string,
    databaseSecurityGroup: ec2.ISecurityGroup,
    port: number,
    description?: string
  ): void {
    const workload = this.workloads.get(serviceName);
    if (!workload) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    // データベースへのIngress許可
    databaseSecurityGroup.addIngressRule(
      workload.getSecurityGroup(),
      ec2.Port.tcp(port),
      description ?? `Allow ${serviceName} to database on port ${port}`
    );

    // ワークロードからのEgress許可
    workload.getSecurityGroup().addEgressRule(
      databaseSecurityGroup,
      ec2.Port.tcp(port),
      description ?? `Allow ${serviceName} to database on port ${port}`
    );
  }

  /**
   * CloudWatchメトリクス参照情報を取得
   */
  public getMetricsReference(): {
    alb: {
      namespace: string;
      dimensionKeys: string[];
      dimensions: { [key: string]: string };
    };
    workloads: {
      [serviceName: string]: {
        namespace: string;
        dimensionKeys: string[];
        dimensions: { [key: string]: string };
      };
    };
  } {
    const workloadMetrics: { 
      [serviceName: string]: {
        namespace: string;
        dimensionKeys: string[];
        dimensions: { [key: string]: string };
      };
    } = {};
    
    this.workloads.forEach((workload, serviceName) => {
      workloadMetrics[serviceName] = workload.getMetricsReference();
    });

    return {
      alb: {
        namespace: 'AWS/ApplicationELB',
        dimensionKeys: ['LoadBalancer'],
        dimensions: {
          LoadBalancer: this.alb.loadBalancer.loadBalancerFullName,
        },
      },
      workloads: workloadMetrics,
    };
  }

  /**
   * アプリケーション全体の設定情報を取得
   */
  public getApplicationInfo(): {
    domain: string;
    applicationUrl: string;
    cognitoLoginUrl: string;
    loadBalancerDnsName: string;
    workloadCount: number;
    workloadServices: string[];
    cognitoConfig: {
      userPoolId: string;
      userPoolClientId: string;
      userPoolDomainName: string;
      region: string;
    };
  } {
    return {
      domain: this.props.domain,
      applicationUrl: this.getApplicationUrl(),
      cognitoLoginUrl: this.getCognitoLoginUrl(),
      loadBalancerDnsName: this.getLoadBalancerDnsName(),
      workloadCount: this.workloads.size,
      workloadServices: Array.from(this.workloads.keys()),
      cognitoConfig: {
        userPoolId: this.props.cognitoAuthConfig.userPool.userPoolId,
        userPoolClientId: this.props.cognitoAuthConfig.userPoolClient.userPoolClientId,
        userPoolDomainName: this.props.cognitoAuthConfig.userPoolDomain.domainName,
        region: cdk.Stack.of(this).region,
      },
    };
  }

  /**
   * すべてのログストリーム情報を取得
   */
  public getLogStreamsInfo(): {
    [serviceName: string]: {
      logGroupName: string;
      logGroupArn: string;
      logConsoleUrl: string;
    };
  } {
    const logInfo: {
      [serviceName: string]: {
        logGroupName: string;
        logGroupArn: string;
        logConsoleUrl: string;
      };
    } = {};

    this.workloads.forEach((workload, serviceName) => {
      const region = cdk.Stack.of(this).region;
      const logGroupName = workload.getLogGroupName();
      
      logInfo[serviceName] = {
        logGroupName,
        logGroupArn: workload.getLogGroupArn(),
        logConsoleUrl: `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(logGroupName)}`,
      };
    });

    return logInfo;
  }
}