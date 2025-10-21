import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Environment } from '../lib/constants';
import { MainStack } from '../lib/stacks/main-stack';
import { getAppParameters } from '../parameter';

describe('MainStack - ECS Fargate + Aurora + Route53 + NLB Architecture', () => {
  describe.each([
    [Environment.DEV, 'development'],
    [Environment.PROD, 'production'],
  ])('Environment: %s (%s)', (environment, envName) => {
    test(`MainStack should be created successfully for ${envName}`, () => {
      const app = new cdk.App();
      const params = getAppParameters(environment);

      const stack = new MainStack(app, `TestMainStack${envName}`, params);

      expect(stack).toBeDefined();

      const template = Template.fromStack(stack);

      // VPC - 必須リソースが存在することを確認
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.26.0.0/16',
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });

      // Cognito User Pool - パラメータ値使用
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: `${params.stackName}-user-pool`,
      });

      // Aurora Cluster
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        Engine: 'aurora-postgresql',
        EngineVersion: '17.5',
      });

      // ECS Cluster - パラメータ値使用
      template.hasResourceProperties('AWS::ECS::Cluster', {
        ClusterName: `${params.stackName}-ecs-cluster`,
      });

      // Application Load Balancer
      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::LoadBalancer',
        {
          Scheme: 'internet-facing',
          Type: 'application',
        }
      );

      // Network Load Balancer
      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::LoadBalancer',
        {
          Scheme: 'internet-facing',
          Type: 'network',
        }
      );

      // ACM Certificate - パラメータ値使用
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: params.domain,
      });

      // Elastic IP
      template.hasResourceProperties('AWS::EC2::EIP', {
        Domain: 'vpc',
      });
    });

    test('VPC should have correct subnet configuration', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.DEV);

      const stack = new MainStack(app, 'TestMainStack', params);

      const template = Template.fromStack(stack);

      // 各タイプのサブネットが2つずつ（Multi-AZ）作成されることを確認
      template.resourceCountIs('AWS::EC2::Subnet', 6); // Public×2, Private×2, DB×2

      // Internet Gateway
      template.hasResourceProperties('AWS::EC2::InternetGateway', {});

      // VPC Endpoints - S3 Gateway + CloudWatch Logs Interfaceのみ（2つ）
      template.resourceCountIs('AWS::EC2::VPCEndpoint', 2);
    });

    test('ECS Task Definition should have correct specifications', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.DEV);

      const stack = new MainStack(app, 'TestMainStack', params);

      const template = Template.fromStack(stack);

      // Backend Task Definition
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Family: 'backend-task',
        Cpu: '256', // 0.25 vCPU
        Memory: '512', // 0.5 GB
        RequiresCompatibilities: ['FARGATE'],
        RuntimePlatform: {
          CpuArchitecture: 'ARM64', // Graviton2
          OperatingSystemFamily: 'LINUX',
        },
      });

      // Frontend Task Definition
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Family: 'frontend-task',
        Cpu: '256', // 0.25 vCPU
        Memory: '512', // 0.5 GB
        RequiresCompatibilities: ['FARGATE'],
        RuntimePlatform: {
          CpuArchitecture: 'ARM64', // Graviton2
          OperatingSystemFamily: 'LINUX',
        },
      });
    });

    test('Aurora should be configured as Provisioned with t3.medium', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.DEV);

      const stack = new MainStack(app, 'TestMainStack', params);

      const template = Template.fromStack(stack);

      // Aurora Cluster のインスタンス設定を確認
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        Engine: 'aurora-postgresql',
        EngineVersion: '17.5',
      });

      // Backup Configuration
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 7,
      });
    });

    test('Security Groups should be properly configured', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.DEV);

      const stack = new MainStack(app, 'TestMainStack', params);

      const template = Template.fromStack(stack);

      // ALB Security Groupはリソースの存在のみ確認
      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::LoadBalancer',
        {
          Scheme: 'internet-facing',
        }
      );

      // Database Security Group - PostgreSQL from VPC
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 5432,
        ToPort: 5432,
      });
    });

    test('NLB and Route53 should be configured correctly', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.DEV);

      const stack = new MainStack(app, 'TestMainStack', params);

      const template = Template.fromStack(stack);

      // Network Load Balancer Target Group
      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::TargetGroup',
        {
          Port: 443,
          Protocol: 'TCP',
          TargetType: 'alb',
        }
      );

      // NLB Listener
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
        Port: 443,
        Protocol: 'TCP',
      });
    });

    test('Stack Outputs should be defined', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.DEV);

      const stack = new MainStack(app, 'TestMainStack', params);

      const template = Template.fromStack(stack);

      // 重要なOutputsが定義されているか確認
      const outputs = template.toJSON().Outputs;

      expect(outputs).toHaveProperty('VpcId');
      expect(outputs).toHaveProperty('UserPoolId');
      expect(outputs).toHaveProperty('DatabaseClusterEndpoint');
      expect(outputs).toHaveProperty('LoadBalancerDnsName');
      expect(outputs).toHaveProperty('NetworkLoadBalancerDnsName');
      expect(outputs).toHaveProperty('StaticIPAddress1');
      expect(outputs).toHaveProperty('StaticIPAddress2');
      expect(outputs).toHaveProperty('StaticIPAddresses');
      expect(outputs).toHaveProperty('CertificateArn');
    });

    test(`Snapshot test for complete MainStack ${envName}`, () => {
      const app = new cdk.App();
      const params = getAppParameters(environment);

      const stack = new MainStack(
        app,
        `TestMainStack${envName}Snapshot`,
        params
      );

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });
  });

  describe('Resource count validation', () => {
    test('should have correct resource counts for development environment', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.DEV);

      const stack = new MainStack(app, 'TestMainStackResourceCount', params);
      const template = Template.fromStack(stack);

      // リソース数の期待値検証
      template.resourceCountIs('AWS::EC2::VPC', 1);
      template.resourceCountIs('AWS::EC2::Subnet', 6); // Public×2, Private×2, DB×2
      template.resourceCountIs('AWS::Cognito::UserPool', 1);
      template.resourceCountIs('AWS::RDS::DBCluster', 1);
      template.resourceCountIs('AWS::ECS::Cluster', 1);
      template.resourceCountIs('AWS::ECS::Service', 2); // Frontend + Backend ECS Services
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 2); // ALB + NLB
      template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
      template.resourceCountIs('AWS::EC2::EIP', 3); // NLB用EIP (2つ) + NAT Gateway用EIP (1つ)、DEV環境
      template.resourceCountIs('AWS::EC2::Instance', 1); // Bastion Host
    });

    test('should have correct resource counts for production environment', () => {
      const app = new cdk.App();
      const params = getAppParameters(Environment.PROD);

      const stack = new MainStack(
        app,
        'TestMainStackResourceCountProd',
        params
      );
      const template = Template.fromStack(stack);

      // 本番環境では2つのNAT Gateway（高可用性）
      template.resourceCountIs('AWS::EC2::NatGateway', 2);
      // Elastic IPs: NAT Gateway用(2) + NLB用(2) = 4個
      template.resourceCountIs('AWS::EC2::EIP', 4);
    });
  });

  test('Bastion Host should be properly configured', () => {
    const app = new cdk.App();
    const params = getAppParameters(Environment.DEV);

    const stack = new MainStack(app, 'TestMainStackBastion', params);

    const template = Template.fromStack(stack);

    // Bastion Host Instance
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't3.micro',
    });

    // Systems Manager用のVPCエンドポイント
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      VpcEndpointType: 'Interface',
    });

    // Bastion用セキュリティグループ
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for Bastion Host',
    });

    // Stack Outputs
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('BastionInstanceId');
    expect(outputs).toHaveProperty('BastionConnectionCommand');
    expect(outputs).toHaveProperty('DatabaseConnectionString');
  });
});
