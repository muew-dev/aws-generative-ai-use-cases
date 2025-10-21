import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { DatabaseConfig, EnvironmentType } from '../../constants';

export interface AuroraDatabaseProps {
  readonly vpc: ec2.IVpc;
  readonly databaseSubnets: ec2.ISubnet[];
  readonly clusterIdentifier: string;
  readonly databaseName: string;
  readonly masterUsername: string;
  readonly secretName: string;
  readonly instanceClass: ec2.InstanceType;
  readonly backupRetentionDays: number;
  readonly port: number;
  readonly environment: EnvironmentType; // 環境別設定用
  readonly enableDataApi?: boolean;
  readonly deletionProtection?: boolean;
  readonly storageEncrypted?: boolean;
}

/**
 * Aurora Database L3 Pattern Construct
 * Aurora PostgreSQL + Multi-AZ + 環境別Reader設定 + Security Group管理
 * 本格的なデータベース運用に必要な設定を包含
 */
export class AuroraDatabase extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly secret: secretsmanager.ISecret;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly subnetGroup: rds.SubnetGroup;

  private readonly props: AuroraDatabaseProps;

  constructor(scope: Construct, id: string, props: AuroraDatabaseProps) {
    super(scope, id);
    this.props = props;

    // データベース用セキュリティグループ
    this.securityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Aurora PostgreSQL cluster',
      allowAllOutbound: false,
    });

    // DB Subnet Group作成（Aurora要件: 最低2つのサブネット、異なるAZに配置）
    this.subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for Aurora PostgreSQL cluster',
      vpcSubnets: {
        subnets: props.databaseSubnets,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // データベース認証情報のSecret作成
    const databaseCredentials = new secretsmanager.Secret(
      this,
      'DatabaseSecret',
      {
        secretName: props.secretName,
        description: 'Aurora PostgreSQL master credentials',
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: props.masterUsername,
          }),
          generateStringKey: 'password',
          excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
          includeSpace: false,
          passwordLength: 32,
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    this.secret = databaseCredentials;

    // Writer インスタンス（必須）
    const writerInstance = rds.ClusterInstance.provisioned('writer', {
      instanceType: props.instanceClass,
      instanceIdentifier: 'writer-instance',
      publiclyAccessible: false,
    });

    // Aurora PostgreSQL Provisioned クラスター（Writer のみ、コスト最適化）
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: DatabaseConfig.POSTGRES_VERSION,
      }),
      clusterIdentifier: props.clusterIdentifier,
      credentials: rds.Credentials.fromSecret(databaseCredentials),
      defaultDatabaseName: props.databaseName,
      writer: writerInstance,
      vpc: props.vpc,
      subnetGroup: this.subnetGroup,
      securityGroups: [this.securityGroup],
      port: props.port,
      backup: {
        retention: cdk.Duration.days(props.backupRetentionDays),
      },
      storageEncrypted: props.storageEncrypted ?? true,
      enableDataApi: props.enableDataApi ?? true, // Bedrock Knowledge Base統合用
      deletionProtection: props.deletionProtection ?? false, // 開発効率重視
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }






  /**
   * クラスターARNを取得
   */
  public getClusterArn(): string {
    return this.cluster.clusterArn;
  }

  /**
   * シークレットARNを取得
   */
  public getSecretArn(): string {
    return this.secret.secretArn;
  }





  /**
   * 踏み台サーバーからのアクセス許可
   */
  public allowBastionAccess(
    bastionSecurityGroup: ec2.ISecurityGroup,
    port: number,
    description: string
  ): void {
    this.securityGroup.addIngressRule(
      bastionSecurityGroup,
      ec2.Port.tcp(port),
      description
    );
  }

  /**
   * 指定されたセキュリティグループからの接続を許可
   */
  public allowIngressFrom(
    sourceSecurityGroup: ec2.ISecurityGroup,
    description?: string
  ): void {
    this.securityGroup.addIngressRule(
      sourceSecurityGroup,
      ec2.Port.tcp(this.props.port),
      description ??
        `Allow PostgreSQL access from ${sourceSecurityGroup.securityGroupId}`
    );
  }





  /**
   * Data API設定情報を取得（Bedrock Knowledge Base用）
   */
  public getDataApiInfo(): {
    clusterArn: string;
    secretArn: string;
    databaseName: string;
    isEnabled: boolean;
  } {
    return {
      clusterArn: this.cluster.clusterArn,
      secretArn: this.secret.secretArn,
      databaseName: this.props.databaseName,
      isEnabled: this.props.enableDataApi ?? true,
    };
  }
}
