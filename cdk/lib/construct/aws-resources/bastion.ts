import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Environment, EnvironmentType } from '../../constants';

export interface BastionProps {
  readonly vpc: ec2.IVpc;
  readonly privateSubnets: ec2.ISubnet[];
  readonly instanceName: string;
  readonly instanceType: ec2.InstanceType;
  readonly environment: EnvironmentType;
}

/**
 * Bastion Host L2 Construct
 * AWS Systems Manager Session Manager経由でアクセス可能な踏み台サーバー
 * プライベートサブネット配置、パブリックIP無し
 */
export class Bastion extends Construct {
  public readonly instance: ec2.Instance;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly role: iam.Role;
  private readonly props: BastionProps;

  constructor(scope: Construct, id: string, props: BastionProps) {
    super(scope, id);
    this.props = props;

    // 環境別の削除設定
    const environment = props.environment;
    const isProduction = environment === Environment.PROD;

    // Bastion用セキュリティグループ
    this.securityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Bastion Host',
      allowAllOutbound: false, // アウトバウンドを明示的に制限
    });

    // HTTPS（443）ポートのみ許可（パッケージ更新・AWS API呼び出し用）
    this.securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS for package updates and AWS API calls'
    );

    // HTTP（80）ポート許可（パッケージリポジトリアクセス用）
    this.securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP for package repository access'
    );

    // VPC内への全トラフィック許可（データベースアクセス用）
    this.securityGroup.addEgressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'All traffic within VPC for database access'
    );

    // Systems Manager用IAMロール
    this.role = new iam.Role(this, 'BastionRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'IAM role for Bastion Host with SSM access',
      managedPolicies: [
        // Systems Manager Session Manager用
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        ),
      ],
    });

    // PostgreSQL CLI、その他データベースツールのインストール用権限
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ssm:GetParameter',
          'ssm:GetParameters',
          'secretsmanager:GetSecretValue',
        ],
        resources: ['*'], // 本番では適切なARNに制限すること
      })
    );

    // 最新のAmazon Linux AMI取得
    const latestAmi = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    // User Data Script - PostgreSQL CLI等のインストール
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      '',
      '# システムアップデート',
      'dnf update -y',
      '',
      '# SSM Agent インストール・起動（最新Amazon Linuxでは標準インストール済み）',
      'dnf install -y amazon-ssm-agent',
      'systemctl enable amazon-ssm-agent',
      'systemctl start amazon-ssm-agent',
      '',
      '# PostgreSQL CLI ツールインストール',
      'dnf install -y postgresql15',
      '',
      '# 便利ツールのインストール',
      'dnf install -y htop nano curl wget git',
      '',
      '# ログ出力',
      'echo "Bastion Host initialization completed at $(date)" >> /var/log/bastion-init.log'
    );

    // EC2 Instance作成
    this.instance = new ec2.Instance(this, 'BastionInstance', {
      instanceName: props.instanceName,
      instanceType: props.instanceType,
      machineImage: latestAmi,
      vpc: props.vpc,
      vpcSubnets: {
        subnets: [props.privateSubnets[0]], // 1つ目のAZのプライベートサブネット
      },
      securityGroup: this.securityGroup,
      role: this.role,
      userData: userData,

      // ストレージ設定
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],

      // セキュリティ設定
      requireImdsv2: true, // IMDSv2強制
    });

    // 環境別のTermination Protection
    if (isProduction) {
      // 本番環境では誤削除防止
      const cfnInstance = this.instance.node.defaultChild as ec2.CfnInstance;
      cfnInstance.disableApiTermination = true;
    }
  }

  /**
   * Systems Manager Session Managerでの接続用出力
   */
  public getSessionManagerCommand(): string {
    return `aws ssm start-session --target ${this.instance.instanceId}`;
  }
}
