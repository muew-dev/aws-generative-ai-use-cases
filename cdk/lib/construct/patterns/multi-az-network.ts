import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import {
  AvailabilityZones,
  Environment,
  EnvironmentType,
} from '../../constants';

export interface MultiAzNetworkProps {
  readonly vpcName: string;
  readonly ipAddress: string;
  readonly subnetCidrMask: number;
  readonly availabilityZones: string[];
  readonly environment: EnvironmentType;
}

/**
 * Multi-AZ Network L3 Pattern
 * VPC + NAT Gateway + VPC Endpoints + Environment-specific configuration
 */
export class MultiAzNetwork extends Construct {
  private readonly props: MultiAzNetworkProps;
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];
  public readonly databaseSubnets: ec2.ISubnet[];
  public readonly vpcEndpoints: { [key: string]: ec2.InterfaceVpcEndpoint };
  public readonly natGateways: ec2.CfnNatGateway[] = []; // NAT Gateway管理

  constructor(scope: Construct, id: string, props: MultiAzNetworkProps) {
    super(scope, id);
    this.props = props;

    // VPC作成
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: props.vpcName,
      ipAddresses: ec2.IpAddresses.cidr(props.ipAddress),
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: props.subnetCidrMask,
          reserved: false,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: props.subnetCidrMask,
          reserved: false,
        },
        {
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: props.subnetCidrMask,
          reserved: false,
        },
      ],
      availabilityZones: props.availabilityZones,
      natGateways: 0, // NAT Gatewayは明示的に作成
    });

    // Subnet参照
    this.publicSubnets = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
    this.databaseSubnets = this.vpc.isolatedSubnets;

    // VPC Endpoints作成
    this.vpcEndpoints = this.createVpcEndpoints();

    // NAT Gateway明示的作成（VPC作成後に実行）
    this.createExplicitNatGateways(props.environment);
  }

  private createVpcEndpoints(): { [key: string]: ec2.InterfaceVpcEndpoint } {
    const endpoints: { [key: string]: ec2.InterfaceVpcEndpoint } = {};

    // ECRからのDockerイメージpullはNAT Gateway経由で実行

    // S3 Gateway Endpoint
    new ec2.GatewayVpcEndpoint(this, 'S3Endpoint', {
      vpc: this.vpc,
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnets: this.privateSubnets },
        { subnets: this.databaseSubnets },
      ],
    });

    // VPCエンドポイント用セキュリティグループ
    const vpcEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      'VpcEndpointSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security group for VPC endpoints',
        allowAllOutbound: false,
      }
    );

    // VPC内からのHTTPS通信を許可
    vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC resources'
    );

    // CloudWatch Logs Endpoint
    endpoints.cloudwatchLogs = new ec2.InterfaceVpcEndpoint(
      this,
      'CloudWatchLogsEndpoint',
      {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        privateDnsEnabled: true,
        securityGroups: [vpcEndpointSecurityGroup],
        subnets: {
          subnets: this.privateSubnets,
        },
      }
    );

    return endpoints;
  }

  /**
   * 明示的なNAT Gateway作成（AZ別配置保証）
   */
  private createExplicitNatGateways(environment: EnvironmentType) {
    const isProduction = environment === Environment.PROD;

    for (let item of this.props.availabilityZones) {
      if (isProduction && item === AvailabilityZones.AP_NORTHEAST_1C) {
        this.createNatGateway(item);
      } else if (item === AvailabilityZones.AP_NORTHEAST_1A) {
        this.createNatGateway(item);
      }
    }

    // Private SubnetのRoute Table設定
    this.configurePrivateSubnetRoutes();
  }

  private createNatGateway(availabilityZone: string) {
    const eip = new ec2.CfnEIP(this, `NatGatewayEIP-${availabilityZone}`, {
      domain: 'vpc',
      tags: [
        {
          key: 'Name',
          value: `${this.props.vpcName}-nat-gateway-eip-${availabilityZone}`,
        },
      ],
    });

    // 各AZのPublic Subnetを明示的に選択
    const publicSubnet = this.publicSubnets.find(
      (subnet) => subnet.availabilityZone === availabilityZone
    )!;

    const natGateway = new ec2.CfnNatGateway(
      this,
      `NatGateway-${availabilityZone}`,
      {
        subnetId: publicSubnet.subnetId,
        allocationId: eip.attrAllocationId,
        tags: [
          {
            key: 'Name',
            value: `${this.props.vpcName}-nat-gateway-${availabilityZone}`,
          },
        ],
      }
    );

    this.natGateways.push(natGateway);
  }

  /**
   * Private SubnetのRoute Table設定（NAT Gateway経由）
   * CDK VPCが自動作成したRoute Tableを使用してルートを追加
   */
  private configurePrivateSubnetRoutes() {
    this.privateSubnets.forEach((subnet, index) => {
      // 開発環境：コスト最適化でNAT Gateway 1個を共有
      // 本番環境：可用性重視で各AZにNAT Gateway配置
      const natGatewayIndex = Math.min(index, this.natGateways.length - 1);
      const natGateway = this.natGateways[natGatewayIndex];

      // CDKの既存Route Tableに手動でルートを追加
      const routeTableId = subnet.routeTable.routeTableId;

      // NAT Gatewayへのルートを既存Route Tableに追加
      new ec2.CfnRoute(this, `NatGatewayRoute-${subnet.availabilityZone}`, {
        routeTableId: routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        natGatewayId: natGateway.ref,
      });
    });
  }
}
