import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Environment } from '../../../lib/constants';
import { MultiAzNetwork } from '../../../lib/construct/patterns/multi-az-network';

describe('MultiAzNetwork L3 Pattern Unit Tests', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { region: 'ap-northeast-1', account: '123456890123' },
    });
  });

  describe.each([
    [Environment.DEV, 'development'],
    [Environment.PROD, 'production'],
  ])('Environment: %s (%s)', (environment, envName) => {
    test(`should create VPC with correct configuration for ${envName}`, () => {
      const network = new MultiAzNetwork(stack, `TestNetwork${envName}`, {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 24,
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: environment,
      });

      // インスタンス変数の確認
      expect(network.vpc).toBeDefined();
      expect(network.publicSubnets).toHaveLength(2);
      expect(network.privateSubnets).toHaveLength(2);
      expect(network.databaseSubnets).toHaveLength(2);
      expect(network.vpcEndpoints).toBeDefined();
      expect(network.natGateways).toBeDefined();

      const template = Template.fromStack(stack);

      // VPC基本設定
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.26.0.0/16',
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });

      // Subnet数の確認
      template.resourceCountIs('AWS::EC2::Subnet', 6); // Public×2, Private×2, Database×2
    });

    test(`should create correct NAT Gateway configuration for ${envName}`, () => {
      const network = new MultiAzNetwork(stack, `TestNetworkNAT${envName}`, {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 24,
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: environment,
      });

      const template = Template.fromStack(stack);

      // 環境に応じたNAT Gateway数
      const expectedNatGateways = environment === Environment.DEV ? 1 : 2;
      template.resourceCountIs('AWS::EC2::NatGateway', expectedNatGateways);

      // EIP数も同様
      template.resourceCountIs('AWS::EC2::EIP', expectedNatGateways);

      // NAT Gateway配列の確認
      expect(network.natGateways).toHaveLength(expectedNatGateways);
    });

    test(`should create VPC endpoints for ${envName}`, () => {
      new MultiAzNetwork(stack, `TestNetworkVPCE${envName}`, {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 24,
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: environment,
      });

      const template = Template.fromStack(stack);

      // S3 Gateway Endpoint（ServiceNameは動的生成される）
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        VpcEndpointType: 'Gateway',
      });

      // CloudWatch Logs Interface Endpoint
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        VpcEndpointType: 'Interface',
        ServiceName: 'com.amazonaws.ap-northeast-1.logs',
      });

      // VPCエンドポイント用SecurityGroup
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for VPC endpoints',
      });

      // VPCエンドポイント数の確認
      template.resourceCountIs('AWS::EC2::VPCEndpoint', 2);
    });

    test(`should configure private subnet routes correctly for ${envName}`, () => {
      new MultiAzNetwork(stack, `TestNetworkRoutes${envName}`, {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 24,
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: environment,
      });

      const template = Template.fromStack(stack);

      // NAT Gateway経由のルートが存在することを確認
      const allRoutes = template.findResources('AWS::EC2::Route');
      const natRoutes = Object.keys(allRoutes).filter(
        (key) => allRoutes[key].Properties.NatGatewayId
      );
      expect(natRoutes.length).toBeGreaterThan(0);

      // Private Subnet数分のルートが存在（2個）
      expect(natRoutes).toHaveLength(2);
    });

    test(`should validate AZ-specific NAT Gateway routing for ${envName}`, () => {
      new MultiAzNetwork(stack, `TestNetworkAZ${envName}`, {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 24,
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: environment,
      });

      const template = Template.fromStack(stack);

      if (environment === Environment.DEV) {
        // 開発環境：NAT Gateway 1個をすべてのPrivate Subnetで共有
        template.resourceCountIs('AWS::EC2::NatGateway', 1);
      } else {
        // 本番環境：各AZにNAT Gateway配置（高可用性）
        template.resourceCountIs('AWS::EC2::NatGateway', 2);
        template.resourceCountIs('AWS::EC2::EIP', 2);
      }
    });

    test(`should create route with AZ-based naming for ${envName}`, () => {
      new MultiAzNetwork(stack, `TestNetworkNaming${envName}`, {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 24,
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: environment,
      });

      const template = Template.fromStack(stack);

      // ルートリソースの論理IDがAZ名を含むことを確認
      const templateJson = template.toJSON();
      const routeKeys = Object.keys(templateJson.Resources).filter(
        (key) =>
          templateJson.Resources[key].Type === 'AWS::EC2::Route' &&
          templateJson.Resources[key].Properties.DestinationCidrBlock ===
            '0.0.0.0/0'
      );

      // AZ名がルートリソース名に含まれていることを確認
      expect(
        routeKeys.some((key) => key.includes('apnortheast1a'))
      ).toBeTruthy();
      expect(
        routeKeys.some((key) => key.includes('apnortheast1c'))
      ).toBeTruthy();
    });
  });

  test('should handle different availability zones', () => {
    const network = new MultiAzNetwork(stack, 'TestNetworkMultiAZ', {
      vpcName: 'test-vpc',
      ipAddress: '10.26.0.0/16',
      subnetCidrMask: 24,
      availabilityZones: [
        'ap-northeast-1a',
        'ap-northeast-1c',
        'ap-northeast-1d',
      ],
      environment: Environment.PROD,
    });

    // 3つのAZでサブネット作成
    expect(network.publicSubnets).toHaveLength(3);
    expect(network.privateSubnets).toHaveLength(3);
    expect(network.databaseSubnets).toHaveLength(3);

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::Subnet', 9); // 3 AZ × 3 subnet types
  });

  test('should validate constructor parameters', () => {
    // 基本的なパラメータ検証（例外が発生しないことを確認）
    expect(() => {
      new MultiAzNetwork(stack, 'TestNetworkValid', {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 24,
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: Environment.DEV,
      });
    }).not.toThrow();

    // 大きなサブネットマスクでの動作確認
    expect(() => {
      new MultiAzNetwork(stack, 'TestNetworkLargeMask', {
        vpcName: 'test-vpc',
        ipAddress: '10.26.0.0/16',
        subnetCidrMask: 28, // より小さなサブネット
        availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
        environment: Environment.DEV,
      });
    }).not.toThrow();
  });
});
