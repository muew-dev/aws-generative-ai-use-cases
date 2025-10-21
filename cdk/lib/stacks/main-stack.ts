import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { AppParameters } from '../../parameter';
import {
  AvailabilityZones,
  CognitoConfig,
  Constants,
  DatabaseConfig,
  EcsConfig,
  S3Config,
  VpcConfig,
} from '../constants';
import {
  Auth,
  Bastion,
  EcsCluster,
  S3RagDocumentBucket,
} from '../construct/aws-resources';
import { ElasticIp, NlbAlbIntegration } from '../construct/cfn-resources';
import {
  AuroraDatabase,
  BedrockRag,
  MultiAzNetwork,
  WebApplication,
} from '../construct/patterns';

/**
 * メインStack - 全AWSリソースを統合
 * INFRA.mdに基づく ECS Fargate + Aurora + ALB 構成
 */
export class MainStack extends Stack {
  constructor(scope: Construct, id: string, params: AppParameters) {
    super(scope, id);

    // ===================
    // L2 Constructs
    // ===================

    // VPC作成（Private/Public/Database Subnets + VPC Endpoints）
    const vpc = new MultiAzNetwork(this, 'VPC', {
      vpcName: `${params.stackName}-vpc`,
      ipAddress: VpcConfig.IP_ADDRESS,
      subnetCidrMask: VpcConfig.SUBNET_CIDR_MASK,
      availabilityZones: [
        AvailabilityZones.AP_NORTHEAST_1A,
        AvailabilityZones.AP_NORTHEAST_1C,
      ],
      environment: params.environment,
    });

    // Cognito認証
    const auth = new Auth(this, 'Auth', {
      userPoolName: `${params.stackName}-user-pool`,
      allowSelfSignUp: params.enableSelfSignUp,
      requireEmailVerification: true,
      environment: params.environment,
      domainPrefix: params.domain.replace(/\./g, '-'),
      domain: params.domain,
      passwordPolicy: {
        minLength: CognitoConfig.PASSWORD_POLICY.MIN_LENGTH,
        requireLowercase: CognitoConfig.PASSWORD_POLICY.REQUIRE_LOWERCASE,
        requireUppercase: CognitoConfig.PASSWORD_POLICY.REQUIRE_UPPERCASE,
        requireDigits: CognitoConfig.PASSWORD_POLICY.REQUIRE_DIGITS,
        requireSymbols: CognitoConfig.PASSWORD_POLICY.REQUIRE_SYMBOLS,
      },
    });

    // Aurora PostgreSQL Provisioned
    const database = new AuroraDatabase(this, 'Aurora', {
      vpc: vpc.vpc,
      databaseSubnets: vpc.databaseSubnets,
      clusterIdentifier: `${params.stackName}-aurora-cluster`,
      databaseName: DatabaseConfig.NAME,
      masterUsername: DatabaseConfig.USERNAME,
      instanceClass: DatabaseConfig.SPEC,
      secretName: DatabaseConfig.SECRET_NAME,
      backupRetentionDays: DatabaseConfig.BACKUP_RETENTION_DAYS,
      environment: params.environment,
      port: DatabaseConfig.PORT,
      enableDataApi: true,
      storageEncrypted: true,
      deletionProtection: false,
    });

    // ECS Fargate Cluster
    const ecsCluster = new EcsCluster(this, 'ECS', {
      vpc: vpc.vpc,
      clusterName: `${params.stackName}-ecs-cluster`,
      containerInsights: true,
    });

    // ===================
    // DNS + SSL Certificate（WebApplicationで使用）
    // ===================

    // 既存のRoute53ホストゾーンを参照（パラメータから取得）
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      'HostedZone',
      {
        hostedZoneId: params.hostedZoneId,
        zoneName: params.domain,
      }
    );

    // ACM証明書作成（DNS検証）- 単一ドメインのみ
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: params.domain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // WebApplication（ALB + ECS + Cognito認証の統合パターン）
    const webApp = new WebApplication(
      this,
      'WebApp',
      {
        vpc: vpc.vpc,
        publicSubnets: vpc.publicSubnets,
        privateSubnets: vpc.privateSubnets,
        domain: params.domain,
        certificate: certificate,
        hostedZone: hostedZone,
        loadBalancerName: Constants.ALB_NAME,
        cognitoAuthConfig: {
          userPool: auth.userPool,
          userPoolClient: auth.userPoolClient,
          userPoolDomain: auth.userPoolDomain,
        },
      },
      ecsCluster.cluster
    );


    // Bastion Host（踏み台サーバー）
    const bastion = new Bastion(this, 'Bastion', {
      vpc: vpc.vpc,
      privateSubnets: vpc.privateSubnets,
      instanceName: `${params.stackName}-bastion-host`,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      environment: params.environment,
    });

    // Bastionからデータベースへのアクセス許可
    database.allowBastionAccess(
      bastion.securityGroup,
      DatabaseConfig.PORT,
      'Allow PostgreSQL access from bastion host'
    );

    // RAG用S3バケット
    const ragDocumentsBucket = new S3RagDocumentBucket(this, 'RagDocuments', {
      bucketName: `${S3Config.RAG_DOCUMENTS_BUCKET_PREFIX}-${params.stackName}-${params.environment}`,
      environment: params.environment,
    });

    // Bedrock RAG統合（Knowledge Base + Aurora PostgreSQL + S3）
    const bedrockRag = new BedrockRag(this, 'BedrockRag', {
      vpc: vpc.vpc,
      databaseCluster: database.cluster,
      databaseSecret: database.secret,
      documentsS3Bucket: ragDocumentsBucket.bucket,
      environment: params.environment,
      dataApiConfig: database.getDataApiInfo(), // Data API設定を適切に渡す
    });

    // ===================
    // Docker Image Asset & WebApplication Workloads
    // ===================

    // Backend Docker Image Asset
    const backendImage = new DockerImageAsset(this, 'BackendImage', {
      directory: '../packages/backend',
      platform: Platform.LINUX_ARM64, // Graviton2 (ARM64) 対応
      buildArgs: {
        BUILDPLATFORM: 'linux/arm64',
        TARGETPLATFORM: 'linux/arm64',
      },
    });

    // Frontend Docker Image Asset
    const frontendImage = new DockerImageAsset(this, 'FrontendImage', {
      directory: '../packages/frontend',
      platform: Platform.LINUX_ARM64, // Graviton2 (ARM64) 対応
      buildArgs: {
        BUILDPLATFORM: 'linux/arm64',
        TARGETPLATFORM: 'linux/arm64',
      },
    });

    // Frontend ワークロード追加
    webApp.addWorkload('Frontend', {
      serviceName: EcsConfig.FRONTEND_SERVICE_NAME,
      taskDefinitionProps: {
        family: EcsConfig.FRONTEND_TASK_FAMILY,
        cpu: 256, // 0.25 vCPU
        memoryLimitMiB: 512, // 0.5 GB RAM
      },
      containerProps: {
        containerName: EcsConfig.FRONTEND_CONTAINER_NAME,
        imageUri: frontendImage.imageUri,
        portMappings: [
          {
            containerPort: EcsConfig.FRONTEND_PORT,
            protocol: ecs.Protocol.TCP,
          },
        ],
        environment: {
          AWS_DEFAULT_REGION: this.region,
          NODE_ENV: 'production',
          // Next.js環境変数
          NEXT_PUBLIC_API_ENDPOINT: `https://${params.domain}/api`,
          NEXT_PUBLIC_COGNITO_USER_POOL_ID: auth.userPool.userPoolId,
          NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID:
            auth.userPoolClient.userPoolClientId,
          NEXT_PUBLIC_COGNITO_REGION: this.region,
          // Server-side Next.js settings
          PORT: EcsConfig.FRONTEND_PORT.toString(),
          HOSTNAME: '0.0.0.0',
        },
        secrets: {},
      },
      autoScaling: params.ecsAutoScaling,
      routing: {
        priority: 200,
        pathPattern: '/*',
        healthCheckPath: '/health',
        authRequired: true, // Cognito認証必須
      },
      logRetentionDays: logs.RetentionDays.ONE_WEEK,
      enableExecuteCommand: false,
    });

    // Backend ワークロード追加
    webApp.addWorkload('Backend', {
      serviceName: EcsConfig.BACKEND_SERVICE_NAME,
      taskDefinitionProps: {
        family: EcsConfig.BACKEND_TASK_FAMILY,
        cpu: 256, // 0.25 vCPU
        memoryLimitMiB: 512, // 0.5 GB RAM
      },
      containerProps: {
        containerName: EcsConfig.BACKEND_CONTAINER_NAME,
        imageUri: backendImage.imageUri,
        portMappings: [
          {
            containerPort: EcsConfig.BACKEND_PORT,
            protocol: ecs.Protocol.TCP,
          },
        ],
        environment: {
          AWS_DEFAULT_REGION: this.region,
          DATABASE_HOST: database.cluster.clusterEndpoint.hostname,
          DATABASE_PORT: DatabaseConfig.PORT.toString(),
          DATABASE_NAME: DatabaseConfig.NAME,
          DATABASE_USER: DatabaseConfig.USERNAME,
          // CORS設定（独自ドメイン対応）
          CORS_ALLOWED_ORIGINS: [
            'http://localhost:3000',
            'https://localhost:3000',
            `https://${params.domain}`,
          ].join(','),
        },
        secrets: {
          DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
            database.secret,
            'password'
          ),
        },
      },
      autoScaling: params.ecsAutoScaling,
      routing: {
        priority: 150,
        pathPattern: '/api/*',
        healthCheckPath: '/api/health',
        authRequired: true, // Cognito認証必須
      },
      logRetentionDays: logs.RetentionDays.ONE_WEEK,
      enableExecuteCommand: false,
    });

    // Database接続許可
    webApp.allowDatabaseConnection(
      EcsConfig.BACKEND_SERVICE_NAME,
      database.securityGroup,
      DatabaseConfig.PORT,
      'Backend service to Aurora'
    );

    // ===================
    // Static IP + NLB
    // ===================

    // Elastic IP作成（Multi-AZ対応）- L1 Construct使用
    const eip1 = new ElasticIp(this, 'StaticIP1', {
      name: `${params.stackName}-static-ip-1a`,
      environment: params.environment,
      availabilityZone: AvailabilityZones.AP_NORTHEAST_1A,
      description: 'Static IP for NLB in AZ-A',
    });

    const eip2 = new ElasticIp(this, 'StaticIP2', {
      name: `${params.stackName}-static-ip-1c`,
      environment: params.environment,
      availabilityZone: AvailabilityZones.AP_NORTHEAST_1C,
      description: 'Static IP for NLB in AZ-C',
    });

    // Network Load Balancer作成
    const nlb = new elbv2.NetworkLoadBalancer(this, 'NetworkLoadBalancer', {
      vpc: vpc.vpc,
      internetFacing: true,
      loadBalancerName: `${params.stackName}-nlb`,
      vpcSubnets: {
        subnets: vpc.publicSubnets,
      },
    });

    // EIPをNLBに割り当て（Multi-AZ構成で高可用性実現）
    const cfnNlb = nlb.node.defaultChild as elbv2.CfnLoadBalancer;
    cfnNlb.addPropertyOverride('SubnetMappings', [
      {
        AllocationId: eip1.getAllocationId(),
        SubnetId: vpc.publicSubnets[0].subnetId, // ap-northeast-1a
      },
      {
        AllocationId: eip2.getAllocationId(),
        SubnetId: vpc.publicSubnets[1].subnetId, // ap-northeast-1c
      },
    ]);
    // Schemeプロパティも明示的に設定
    cfnNlb.addPropertyOverride('Scheme', 'internet-facing');

    // Route53 Aレコード作成（genu.muew.dev apex record）
    new route53.ARecord(this, 'DomainARecord', {
      zone: hostedZone,
      // recordNameは省略（ホストゾーンのapexレコードを作成）
      target: route53.RecordTarget.fromIpAddresses(
        eip1.getPublicIp(),
        eip2.getPublicIp()
      ),
      ttl: cdk.Duration.minutes(5),
    });

    // ===================
    // NLB to ALB Target Group設定 - L1 Construct使用
    // ===================

    // NLB-ALB統合（TLS Passthrough）- L1 Construct使用
    const nlbAlbIntegration = new NlbAlbIntegration(this, 'NlbAlbIntegration', {
      nlbArn: nlb.loadBalancerArn,
      albArn: webApp.alb.loadBalancer.loadBalancerArn,
      vpcId: vpc.vpc.vpcId,
      targetGroupName: `${params.stackName}-alb-tg`,
      port: 443,
    });

    // ===================
    // Stack Outputs
    // ===================

    new CfnOutput(this, 'VpcId', {
      value: vpc.vpc.vpcId,
      description: 'VPC ID',
    });

    new CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new CfnOutput(this, 'UserPoolDomainName', {
      value: auth.userPoolDomain.domainName,
      description: 'Cognito User Pool Domain Name',
    });

    new CfnOutput(this, 'CognitoLoginUrl', {
      value: `https://${auth.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com/login?client_id=${auth.userPoolClient.userPoolClientId}&response_type=code&scope=openid+email+profile&redirect_uri=https://${params.domain}/oauth2/idpresponse`,
      description: 'Cognito Login URL',
    });

    new CfnOutput(this, 'DatabaseClusterEndpoint', {
      value: database.cluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL Cluster Endpoint',
    });

    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: webApp.alb.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
    });

    new CfnOutput(this, 'StaticIPAddress1', {
      value: eip1.getPublicIp(),
      description: 'Elastic IP Address 1 (AZ-A: ap-northeast-1a)',
    });

    new CfnOutput(this, 'StaticIPAddress2', {
      value: eip2.getPublicIp(),
      description: 'Elastic IP Address 2 (AZ-C: ap-northeast-1c)',
    });

    new CfnOutput(this, 'StaticIPAddresses', {
      value: `${eip1.getPublicIp()}, ${eip2.getPublicIp()}`,
      description: 'All Static IP Addresses (for firewall whitelist)',
    });

    new CfnOutput(this, 'NetworkLoadBalancerDnsName', {
      value: nlb.loadBalancerDnsName,
      description: 'Network Load Balancer DNS Name',
    });

    new CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
      description: 'ACM Certificate ARN',
    });

    // L1 Construct統合情報出力
    new CfnOutput(this, 'NlbAlbTargetGroupArn', {
      value: nlbAlbIntegration.targetGroup.getTargetGroupArn(),
      description: 'NLB to ALB Target Group ARN',
    });

    new CfnOutput(this, 'NlbListenerArn', {
      value: nlbAlbIntegration.listener.getListenerArn(),
      description: 'NLB Listener ARN (Port 443)',
    });

    // Media Files S3バケット削除（Frontend ECSから配信）

    // Bastion Host接続情報
    new CfnOutput(this, 'BastionInstanceId', {
      value: bastion.instance.instanceId,
      description: 'Bastion Host Instance ID',
    });

    new CfnOutput(this, 'BastionConnectionCommand', {
      value: bastion.getSessionManagerCommand(),
      description: 'Bastion Host Session Manager Connection Command',
    });

    new CfnOutput(this, 'DatabaseConnectionString', {
      value: `psql -h ${database.cluster.clusterEndpoint.hostname} -p ${DatabaseConfig.PORT} -U ${DatabaseConfig.USERNAME} -d ${DatabaseConfig.NAME}`,
      description: 'Database Connection String (from Bastion Host)',
    });

    // アプリケーションURL（独自ドメイン）
    new CfnOutput(this, 'ApplicationUrl', {
      value: `https://${params.domain}/`,
      description: 'Application URL (Custom Domain)',
    });

    // ECS CloudWatch Logs情報（WebApplicationパターンから取得）
    const frontendWorkloadFromWebApp = webApp.getWorkload(
      EcsConfig.FRONTEND_SERVICE_NAME
    );
    const backendWorkloadFromWebApp = webApp.getWorkload(
      EcsConfig.BACKEND_SERVICE_NAME
    );

    if (frontendWorkloadFromWebApp) {
      new CfnOutput(this, 'FrontendLogGroupName', {
        value: frontendWorkloadFromWebApp.logGroup.logGroupName,
        description: 'Frontend Service CloudWatch Log Group Name',
      });

      new CfnOutput(this, 'FrontendLogsConsoleUrl', {
        value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:log-groups/log-group/${encodeURIComponent(frontendWorkloadFromWebApp.logGroup.logGroupName)}`,
        description: 'Frontend Service CloudWatch Logs Console URL',
      });
    }

    if (backendWorkloadFromWebApp) {
      new CfnOutput(this, 'BackendLogGroupName', {
        value: backendWorkloadFromWebApp.logGroup.logGroupName,
        description: 'Backend Service CloudWatch Log Group Name',
      });

      new CfnOutput(this, 'BackendLogsConsoleUrl', {
        value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:log-groups/log-group/${encodeURIComponent(backendWorkloadFromWebApp.logGroup.logGroupName)}`,
        description: 'Backend Service CloudWatch Logs Console URL',
      });
    }

    // RAG関連の出力
    new CfnOutput(this, 'RagDocumentsBucketName', {
      value: ragDocumentsBucket.getBucketName(),
      description: 'RAG Documents S3 Bucket Name',
    });

    new CfnOutput(this, 'BedrockKnowledgeBaseId', {
      value: bedrockRag.getKnowledgeBaseId(),
      description: 'Bedrock Knowledge Base ID',
    });

    new CfnOutput(this, 'BedrockKnowledgeBaseArn', {
      value: bedrockRag.getKnowledgeBaseArn(),
      description: 'Bedrock Knowledge Base ARN',
    });

    new CfnOutput(this, 'BedrockDataSourceId', {
      value: bedrockRag.getDataSourceId(),
      description: 'Bedrock Knowledge Base Data Source ID',
    });

    new CfnOutput(this, 'RagVectorStoreInfo', {
      value: JSON.stringify(bedrockRag.getVectorStoreInfo(), null, 2),
      description: 'RAG Vector Store Configuration (Aurora PostgreSQL)',
    });
  }
}
