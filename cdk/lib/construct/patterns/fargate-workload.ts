import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { BedrockConfig } from '../../constants';

export interface FargateWorkloadProps {
  readonly cluster: ecs.ICluster;
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
  readonly logRetentionDays?: logs.RetentionDays;
  readonly enableExecuteCommand?: boolean;
}

/**
 * Fargate Workload L3 Pattern Construct
 * ECS Fargate Service + Auto Scaling + Log Groups + IAM Roles の統合パターン
 * 本格的なワークロード運用に必要な設定を包含
 */
export class FargateWorkload extends Construct {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly logGroup: logs.LogGroup;
  public readonly taskExecutionRole: iam.Role;
  public readonly taskRole: iam.Role;

  private readonly props: FargateWorkloadProps;

  constructor(scope: Construct, id: string, props: FargateWorkloadProps) {
    super(scope, id);
    this.props = props;

    // Task用セキュリティグループ
    this.securityGroup = new ec2.SecurityGroup(
      this,
      'SecurityGroup',
      {
        vpc: props.cluster.vpc!,
        description: `Security group for ${props.serviceName} Fargate workload`,
        allowAllOutbound: true,
      }
    );

    // CloudWatch Log Group作成
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/${props.serviceName}`,
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // IAM Roles作成
    this.taskExecutionRole = this.createTaskExecutionRole();
    this.taskRole = this.createTaskRole();

    // Task Definition作成
    this.taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {
        family: props.taskDefinitionProps.family,
        cpu: props.taskDefinitionProps.cpu,
        memoryLimitMiB: props.taskDefinitionProps.memoryLimitMiB,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        executionRole: this.taskExecutionRole,
        taskRole: this.taskRole,
      }
    );

    // コンテナ定義追加
    this.taskDefinition.addContainer(props.containerProps.containerName, {
      image: ecs.ContainerImage.fromRegistry(props.containerProps.imageUri),
      portMappings: props.containerProps.portMappings,
      environment: props.containerProps.environment,
      secrets: props.containerProps.secrets,
      logging: ecs.LogDriver.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: 'ecs',
      }),
    });

    // Fargate Service作成（Multi-AZ配置戦略）
    this.service = new ecs.FargateService(
      this,
      'FargateService',
      {
        cluster: props.cluster,
        taskDefinition: this.taskDefinition,
        serviceName: props.serviceName,
        desiredCount: props.autoScaling.minCapacity,
        minHealthyPercent: 50,
        maxHealthyPercent: 200,
        vpcSubnets: {
          subnets: props.cluster.vpc!.privateSubnets,
        },
        securityGroups: [this.securityGroup],
        enableExecuteCommand: props.enableExecuteCommand ?? false,
        assignPublicIp: false,
        // Multi-AZ配置: AZ間自動リバランシング有効化
        availabilityZoneRebalancing: ecs.AvailabilityZoneRebalancing.ENABLED,
      }
    );

    // Auto Scaling設定（環境別パラメータ）
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: props.autoScaling.minCapacity,
      maxCapacity: props.autoScaling.maxCapacity,
    });

    // CPU使用率ベースのスケーリング
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: props.autoScaling.targetCpuUtilization,
      scaleInCooldown: cdk.Duration.minutes(
        props.autoScaling.scaleInCooldownMinutes
      ),
      scaleOutCooldown: cdk.Duration.minutes(
        props.autoScaling.scaleOutCooldownMinutes
      ),
    });
  }

  /**
   * Task Execution Role作成（ECR、CloudWatch Logsアクセス用）
   */
  private createTaskExecutionRole(): iam.Role {
    const role = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task execution role for ${this.props.serviceName}`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // ECR認証用の追加権限
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: ['*'],
      })
    );

    // Secrets Manager権限（データベース認証情報のみ - 最小権限の原則）
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          // Aurora PostgreSQLの認証情報のみ許可
          `arn:aws:secretsmanager:${region}:${account}:secret:generative-ai-use-cases/aurora-credentials*`,
        ],
      })
    );

    return role;
  }

  /**
   * Task Role作成（アプリケーション用AWS API権限）
   */
  private createTaskRole(): iam.Role {
    const role = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task role for ${this.props.serviceName}`,
    });

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // Amazon Bedrock権限（ap-northeast-1の利用可能モデルのみ）
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: BedrockConfig.getModelArns(region),
      })
    );

    // Secrets Manager権限（データベース認証情報のみ - 最小権限の原則）
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          // Aurora PostgreSQLの認証情報のみ許可
          `arn:aws:secretsmanager:${region}:${account}:secret:generative-ai-use-cases/aurora-credentials*`,
        ],
      })
    );

    return role;
  }

  /**
   * サービス名を取得
   */
  public getServiceName(): string {
    return this.props.serviceName;
  }

  /**
   * サービスARNを取得
   */
  public getServiceArn(): string {
    return this.service.serviceArn;
  }

  /**
   * Task Definition ARNを取得
   */
  public getTaskDefinitionArn(): string {
    return this.taskDefinition.taskDefinitionArn;
  }

  /**
   * Log Group名を取得
   */
  public getLogGroupName(): string {
    return this.logGroup.logGroupName;
  }

  /**
   * Log Group ARNを取得
   */
  public getLogGroupArn(): string {
    return this.logGroup.logGroupArn;
  }

  /**
   * SecurityGroupを取得
   */
  public getSecurityGroup(): ec2.ISecurityGroup {
    return this.securityGroup;
  }

  /**
   * Auto Scaling設定情報を取得
   */
  public getAutoScalingInfo(): {
    minCapacity: number;
    maxCapacity: number;
    targetCpuUtilization: number;
    scaleInCooldownMinutes: number;
    scaleOutCooldownMinutes: number;
  } {
    return {
      minCapacity: this.props.autoScaling.minCapacity,
      maxCapacity: this.props.autoScaling.maxCapacity,
      targetCpuUtilization: this.props.autoScaling.targetCpuUtilization,
      scaleInCooldownMinutes: this.props.autoScaling.scaleInCooldownMinutes,
      scaleOutCooldownMinutes: this.props.autoScaling.scaleOutCooldownMinutes,
    };
  }

  /**
   * 指定されたセキュリティグループからの接続を許可
   */
  public allowConnectionsFrom(
    sourceSecurityGroup: ec2.ISecurityGroup,
    port: number,
    description?: string
  ): void {
    this.securityGroup.addIngressRule(
      sourceSecurityGroup,
      ec2.Port.tcp(port),
      description ?? `Allow traffic from ${sourceSecurityGroup.securityGroupId}`
    );
  }

  /**
   * CloudWatchメトリクス参照情報を取得
   */
  public getMetricsReference(): {
    namespace: string;
    dimensionKeys: string[];
    dimensions: { [key: string]: string };
  } {
    return {
      namespace: 'AWS/ECS',
      dimensionKeys: ['ServiceName', 'ClusterName'],
      dimensions: {
        ServiceName: this.props.serviceName,
        ClusterName: this.props.cluster.clusterName,
      },
    };
  }

  /**
   * Task定義の属性情報を取得
   */
  public getTaskDefinitionInfo(): {
    family: string;
    cpu: number;
    memory: number;
    runtimePlatform: {
      cpuArchitecture: string;
      operatingSystemFamily: string;
    };
  } {
    return {
      family: this.props.taskDefinitionProps.family,
      cpu: this.props.taskDefinitionProps.cpu,
      memory: this.props.taskDefinitionProps.memoryLimitMiB,
      runtimePlatform: {
        cpuArchitecture: 'ARM64',
        operatingSystemFamily: 'LINUX',
      },
    };
  }
}