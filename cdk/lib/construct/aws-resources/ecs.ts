import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { BedrockConfig } from '../../constants';

export interface EcsClusterProps {
  readonly vpc: ec2.IVpc;
  readonly clusterName: string;
}

export interface FargateServiceProps {
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
}

/**
 * ECS Fargate L2 Construct
 */
export class Ecs extends Construct {
  private readonly props: EcsClusterProps;
  public readonly cluster: ecs.Cluster;
  public readonly services: Map<string, ecs.FargateService> = new Map();
  public readonly taskDefinitions: Map<string, ecs.FargateTaskDefinition> =
    new Map();
  public readonly securityGroups: Map<string, ec2.SecurityGroup> = new Map();
  public readonly logGroups: Map<string, logs.LogGroup> = new Map();

  constructor(scope: Construct, id: string, props: EcsClusterProps) {
    super(scope, id);
    this.props = props;

    // ECS Cluster作成
    this.cluster = new ecs.Cluster(this, 'ECSCluster', {
      clusterName: props.clusterName,
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
    });

    // Container Insights v2を有効化
    this.cluster.addDefaultCloudMapNamespace({
      name: 'generative-ai-use-cases',
    });
  }

  /**
   * Fargateサービスを作成
   */
  public createFargateService(props: FargateServiceProps): ecs.FargateService {
    // Task用セキュリティグループ
    const securityGroup = new ec2.SecurityGroup(
      this,
      `${props.serviceName}-security-group`,
      {
        vpc: this.cluster.vpc!,
        description: `Security group for ${props.serviceName} ECS service`,
        allowAllOutbound: true,
      }
    );

    // コンテナポートへのアクセス許可（ALBからのアクセスのみ、VPC全体は過度に広い）
    // Note: 実際のALB SecurityGroupからの許可はmain-stack.tsで設定される

    this.securityGroups.set(props.serviceName, securityGroup);

    // Task Definition作成
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${props.serviceName}-task-def`,
      {
        family: props.taskDefinitionProps.family,
        cpu: props.taskDefinitionProps.cpu,
        memoryLimitMiB: props.taskDefinitionProps.memoryLimitMiB,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        executionRole: this.createTaskExecutionRole(props.serviceName),
        taskRole: this.createTaskRole(props.serviceName),
      }
    );

    this.taskDefinitions.set(props.serviceName, taskDefinition);

    // CloudWatch Log Group作成
    const logGroup = new logs.LogGroup(this, `${props.serviceName}-log-group`, {
      logGroupName: `/ecs/${props.serviceName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.logGroups.set(props.serviceName, logGroup);

    // コンテナ定義
    taskDefinition.addContainer(props.containerProps.containerName, {
      image: ecs.ContainerImage.fromRegistry(props.containerProps.imageUri),
      portMappings: props.containerProps.portMappings,
      environment: props.containerProps.environment,
      secrets: props.containerProps.secrets,
      logging: ecs.LogDriver.awsLogs({
        logGroup,
        streamPrefix: 'ecs',
      }),
    });

    // Fargate Service作成（Multi-AZ配置戦略）
    const service = new ecs.FargateService(
      this,
      `${props.serviceName}-fargate-service`,
      {
        cluster: this.cluster,
        taskDefinition,
        serviceName: props.serviceName,
        desiredCount: props.autoScaling.minCapacity,
        minHealthyPercent: 50,
        maxHealthyPercent: 200,
        vpcSubnets: {
          subnets: this.cluster.vpc!.privateSubnets,
        },
        securityGroups: [securityGroup],
        enableExecuteCommand: false,
        assignPublicIp: false,
        // Multi-AZ配置: AZ間自動リバランシング有効化
        availabilityZoneRebalancing: ecs.AvailabilityZoneRebalancing.ENABLED,
      }
    );

    // Auto Scaling設定（環境別パラメータ）
    const scaling = service.autoScaleTaskCount({
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

    this.services.set(props.serviceName, service);
    return service;
  }

  /**
   * Task Execution Role作成（ECR、CloudWatch Logsアクセス用）
   */
  private createTaskExecutionRole(serviceName: string): iam.Role {
    const role = new iam.Role(this, `${serviceName}TaskExecutionRole`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task execution role for ${serviceName}`,
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
  private createTaskRole(serviceName: string): iam.Role {
    const role = new iam.Role(this, `${serviceName}-task-role`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task role for ${serviceName}`,
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

    // S3バケット不使用（Frontend ECSから配信に変更）のため削除

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
   * セキュリティグループを取得
   */
  public getSecurityGroup(serviceName: string): ec2.ISecurityGroup | undefined {
    return this.securityGroups.get(serviceName);
  }

  /**
   * CloudWatch Log Groupを取得
   */
  public getLogGroup(serviceName: string): logs.ILogGroup | undefined {
    return this.logGroups.get(serviceName);
  }
}
