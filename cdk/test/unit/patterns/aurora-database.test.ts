import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AuroraDatabase } from '../../../lib/construct/patterns/aurora-database';
import { DatabaseConfig, Environment } from '../../../lib/constants';

describe('AuroraDatabase Pattern', () => {
  describe.each([
    [Environment.DEV, 'development'],
    [Environment.PROD, 'production'],
  ])('Environment: %s (%s)', (environment, envName) => {
    let app: cdk.App;
    let stack: cdk.Stack;
    let vpc: ec2.Vpc;
    let databaseSubnets: ec2.ISubnet[];

    beforeEach(() => {
      app = new cdk.App();
      stack = new cdk.Stack(app, `TestStack${envName}`);
      
      // Test用のVPCとサブネットを作成
      vpc = new ec2.Vpc(stack, 'TestVpc', {
        ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
        maxAzs: 2,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'Database',
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });
      
      databaseSubnets = vpc.isolatedSubnets;
    });

    test(`should create AuroraDatabase with ${envName} configuration`, () => {
      const backupRetentionDays = environment === Environment.DEV ? 7 : 30;
      const deletionProtection = environment === Environment.PROD;
      const enableDataApi = true;
      const storageEncrypted = true;

      new AuroraDatabase(stack, 'TestAuroraDatabase', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: backupRetentionDays,
        port: 5432,
        environment: environment,
        deletionProtection: deletionProtection,
        enableDataApi: enableDataApi,
        storageEncrypted: storageEncrypted,
      });

      const template = Template.fromStack(stack);

      // Aurora Cluster
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        Engine: 'aurora-postgresql',
        EngineVersion: DatabaseConfig.POSTGRES_VERSION.auroraPostgresFullVersion,
        DBClusterIdentifier: `test-cluster-${environment}`,
        DatabaseName: 'testdb',
        Port: 5432,
        BackupRetentionPeriod: backupRetentionDays,
        StorageEncrypted: storageEncrypted,
        EnableHttpEndpoint: enableDataApi,
        DeletionProtection: deletionProtection,
      });

      // DB Subnet Group
      template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {
        DBSubnetGroupDescription: 'Subnet group for Aurora PostgreSQL cluster',
      });

      // Security Group
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Aurora PostgreSQL cluster',
      });

      // Secrets Manager Secret
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: `test-secret-${environment}`,
        Description: 'Aurora PostgreSQL master credentials',
      });
    });

    test(`should create cluster with writer instance only for ${envName}`, () => {
      new AuroraDatabase(stack, 'TestAuroraDatabase', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: environment === Environment.DEV ? 7 : 30,
        port: 5432,
        environment: environment,
      });

      const template = Template.fromStack(stack);

      // Writer インスタンスのみ作成される
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t3.medium',
        DBInstanceIdentifier: 'writer-instance',
        PubliclyAccessible: false,
      });

      // Reader インスタンスは作成されない（コスト最適化）
      template.resourceCountIs('AWS::RDS::DBInstance', 1);
    });

    test(`should generate secure password for database secret - ${envName}`, () => {
      new AuroraDatabase(stack, 'TestAuroraDatabase', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: environment === Environment.DEV ? 7 : 30,
        port: 5432,
        environment: environment,
      });

      const template = Template.fromStack(stack);

      // パスワード生成設定の確認
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        GenerateSecretString: {
          SecretStringTemplate: '{"username":"testuser"}',
          GenerateStringKey: 'password',
          ExcludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
          IncludeSpace: false,
          PasswordLength: 32,
        },
      });
    });

    test(`should create correct resource count for ${envName}`, () => {
      new AuroraDatabase(stack, 'TestAuroraDatabase', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: environment === Environment.DEV ? 7 : 30,
        port: 5432,
        environment: environment,
      });

      const template = Template.fromStack(stack);

      // リソース数の確認
      template.resourceCountIs('AWS::RDS::DBCluster', 1);
      template.resourceCountIs('AWS::RDS::DBInstance', 1); // Writer のみ
      template.resourceCountIs('AWS::RDS::DBSubnetGroup', 1);
      template.resourceCountIs('AWS::EC2::SecurityGroup', 1); // Database SecurityGroup のみ
      template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    });

    test(`should provide getter methods for ARNs and Data API info - ${envName}`, () => {
      const construct = new AuroraDatabase(stack, 'TestAuroraDatabase', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: environment === Environment.DEV ? 7 : 30,
        port: 5432,
        environment: environment,
        deletionProtection: environment === Environment.PROD,
        enableDataApi: true,
      });

      // ARN getter methods のテスト（CDKはトークンとして文字列を返す）
      expect(construct.getClusterArn()).toBeDefined();
      expect(typeof construct.getClusterArn()).toBe('string');
      expect(construct.getSecretArn()).toBeDefined();
      expect(typeof construct.getSecretArn()).toBe('string');

      // Data API情報のテスト（enableDataApi: true）
      const dataApiInfo = construct.getDataApiInfo();
      expect(dataApiInfo.clusterArn).toBeDefined();
      expect(dataApiInfo.secretArn).toBeDefined();
      expect(dataApiInfo.databaseName).toBe('testdb');
      expect(dataApiInfo.isEnabled).toBe(true);

      // Data API無効時のテスト
      const constructDisabled = new AuroraDatabase(stack, 'TestAuroraDatabaseDisabled', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-disabled-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-disabled-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: environment === Environment.DEV ? 7 : 30,
        port: 5432,
        environment: environment,
        enableDataApi: false,
      });

      const dataApiInfoDisabled = constructDisabled.getDataApiInfo();
      expect(dataApiInfoDisabled.isEnabled).toBe(false);
    });

    test(`should allow database access from other security groups - ${envName}`, () => {
      const construct = new AuroraDatabase(stack, 'TestAuroraDatabase', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: environment === Environment.DEV ? 7 : 30,
        port: 5432,
        environment: environment,
      });

      // 別のセキュリティグループを作成
      const appSecurityGroup = new ec2.SecurityGroup(stack, 'AppSecurityGroup', {
        vpc: vpc,
        description: 'Application security group',
      });

      // データベースへのアクセス許可（デフォルトメッセージ使用）
      construct.allowIngressFrom(appSecurityGroup);

      // カスタムメッセージでのアクセス許可
      const bastionSecurityGroup = new ec2.SecurityGroup(stack, 'BastionSecurityGroup', {
        vpc: vpc,
        description: 'Bastion security group',
      });
      construct.allowIngressFrom(bastionSecurityGroup, 'Allow database access from bastion host');

      // allowBastionAccess メソッドのテスト
      const adminSecurityGroup = new ec2.SecurityGroup(stack, 'AdminSecurityGroup', {
        vpc: vpc,
        description: 'Admin security group',
      });
      construct.allowBastionAccess(adminSecurityGroup, 5432, 'Allow admin database access');

      const template = Template.fromStack(stack);

      // セキュリティグループルールが作成されることを確認（論理IDは動的なので基本的なプロパティのみチェック）
      template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 3); // allowIngressFrom 2つ + allowBastionAccess 1つ
      
      // 基本的なIngress設定の確認
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 5432,
        ToPort: 5432,
      });

      // カスタムメッセージの確認
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        Description: 'Allow database access from bastion host',
      });

      // admin用のルールも確認
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        Description: 'Allow admin database access',
        IpProtocol: 'tcp',
        FromPort: 5432,
        ToPort: 5432,
      });
    });

    test(`snapshot test for AuroraDatabase pattern - ${envName}`, () => {
      const construct = new AuroraDatabase(stack, 'TestAuroraDatabase', {
        vpc: vpc,
        databaseSubnets: databaseSubnets,
        clusterIdentifier: `test-cluster-${environment}`,
        databaseName: 'testdb',
        masterUsername: 'testuser',
        secretName: `test-secret-${environment}`,
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        backupRetentionDays: environment === Environment.DEV ? 7 : 30,
        port: 5432,
        environment: environment,
        deletionProtection: environment === Environment.PROD,
      });

      // Construct が正しく作成されることを確認
      expect(construct.cluster).toBeDefined();
      expect(construct.secret).toBeDefined();
      expect(construct.securityGroup).toBeDefined();
      expect(construct.subnetGroup).toBeDefined();

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot(`aurora-database-${environment}`);
    });
  });
});