import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { DatabaseConfig, Environment, EnvironmentType } from '../../constants';

export interface DatabaseProps {
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
}

/**
 * Aurora PostgreSQL Provisioned L2 Construct
 */
export class Database extends Construct {
  private readonly props: DatabaseProps;
  public readonly cluster: rds.DatabaseCluster;
  public readonly secret: secretsmanager.ISecret;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);
    this.props = props;

    // 環境判定（Reader DB用）
    const isProduction = props.environment === Environment.PROD;


    // データベース用セキュリティグループ
    this.securityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Aurora PostgreSQL cluster',
      allowAllOutbound: false,
    });

    // PostgreSQLポート(5432)へのアクセス許可は明示的に設定
    // Note: ECSとBastionからの具体的なアクセスはallowConnectionsFromで設定される

    // DB Subnet Group作成（Aurora要件: 最低2つのサブネット、異なるAZに配置）
    const subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for Aurora PostgreSQL cluster',
      vpcSubnets: {
        subnets: props.databaseSubnets,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 全環境で削除
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
        removalPolicy: cdk.RemovalPolicy.DESTROY, // 全環境で削除
      }
    );

    this.secret = databaseCredentials;

    // Aurora PostgreSQL Provisioned クラスター
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: DatabaseConfig.POSTGRES_VERSION,
      }),
      clusterIdentifier: props.clusterIdentifier,
      credentials: rds.Credentials.fromSecret(databaseCredentials),
      defaultDatabaseName: props.databaseName,

      // Writer インスタンス（必須）
      writer: rds.ClusterInstance.provisioned('writer', {
        instanceType: props.instanceClass,
        instanceIdentifier: 'writer-instance',
        publiclyAccessible: false,
      }),

      // 本番環境のみ Reader インスタンス追加（自動フェイルオーバー用）
      readers: isProduction
        ? [
            rds.ClusterInstance.provisioned('reader', {
              instanceType: props.instanceClass,
              instanceIdentifier: 'reader-instance',
              publiclyAccessible: false,
            }),
          ]
        : undefined,

      // ネットワーク設定
      vpc: props.vpc,
      subnetGroup: subnetGroup,
      securityGroups: [this.securityGroup],
      port: props.port,

      // バックアップ設定
      backup: {
        retention: cdk.Duration.days(props.backupRetentionDays),
        // preferredWindowは指定せず、AWSが自動選択
      },

      // セキュリティ設定
      storageEncrypted: true,

      // Bedrock Knowledge Base統合用 Data API有効化
      enableDataApi: true,

      // 全環境統一削除設定（開発効率重視）
      deletionProtection: false, // 全環境で削除可能
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 全環境で削除
    });
  }

  /**
   * ECSタスクからのアクセス許可
   */
  public allowConnectionsFrom(
    securityGroup: ec2.ISecurityGroup,
    port: number,
    description: string
  ) {
    this.securityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcp(port),
      description
    );
  }

  /**
   * 踏み台サーバーからのアクセス許可
   */
  public allowBastionAccess(
    bastionSecurityGroup: ec2.ISecurityGroup,
    port: number,
    description: string
  ) {
    this.securityGroup.addIngressRule(
      bastionSecurityGroup,
      ec2.Port.tcp(port),
      description
    );
  }
}
