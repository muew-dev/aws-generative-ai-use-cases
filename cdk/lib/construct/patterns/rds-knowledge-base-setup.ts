import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { RagConfig } from '../../constants';

export interface RdsKnowledgeBaseSetupProps {
  readonly databaseCluster: rds.IDatabaseCluster;
  readonly databaseSecret: secretsmanager.ISecret;
  readonly databaseName: string;
}

/**
 * RDS Knowledge Base Setup Construct (L3 Pattern)
 * Bedrock Knowledge Base用のAurora PostgreSQL設定パターン
 * - pgvectorスキーマ・テーブル・インデックスの自動設定
 * - 専用ユーザーとSecret作成
 * - Bedrock統合用の権限設定
 */
export class RdsKnowledgeBaseSetup extends Construct {
  private readonly databaseCluster: rds.IDatabaseCluster;
  private readonly databaseSecret: secretsmanager.ISecret;
  private readonly databaseName: string;

  public readonly bedrockUserSecret: secretsmanager.Secret;
  public readonly schemaSetup: AwsCustomResource;
  public readonly extensionSetup: AwsCustomResource;
  public readonly tableSetup: AwsCustomResource;
  public readonly vectorIndexSetup: AwsCustomResource;
  public readonly textIndexSetup: AwsCustomResource;
  public readonly userSetup: AwsCustomResource;

  constructor(scope: Construct, id: string, props: RdsKnowledgeBaseSetupProps) {
    super(scope, id);

    this.databaseCluster = props.databaseCluster;
    this.databaseSecret = props.databaseSecret;
    this.databaseName = props.databaseName;

    // 0. bedrock_user用のシークレット作成
    this.bedrockUserSecret = this.createBedrockUserSecret();

    // 1. スキーマ作成
    this.schemaSetup = this.createSchemaSetup();

    // 2. pgvector拡張機能有効化
    this.extensionSetup = this.createExtensionSetup();

    // 3. テーブル作成
    this.tableSetup = this.createTableSetup();

    // 4. ベクターインデックス作成
    this.vectorIndexSetup = this.createVectorIndexSetup();

    // 5. テキストインデックス作成
    this.textIndexSetup = this.createTextIndexSetup();

    // 6. bedrock_user作成
    this.userSetup = this.createUserSetup();

    // 依存関係の設定
    this.extensionSetup.node.addDependency(this.schemaSetup);
    this.tableSetup.node.addDependency(this.extensionSetup);
    this.vectorIndexSetup.node.addDependency(this.tableSetup);
    this.textIndexSetup.node.addDependency(this.vectorIndexSetup);
    this.userSetup.node.addDependency(this.textIndexSetup);
  }

  /**
   * bedrock_integrationスキーマ作成
   */
  private createSchemaSetup(): AwsCustomResource {
    return new AwsCustomResource(this, 'CreateBedrockSchema', {
      onCreate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: 'CREATE SCHEMA IF NOT EXISTS bedrock_integration;',
        },
        physicalResourceId: PhysicalResourceId.of('bedrock-schema-creation'),
      },
      onDelete: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: 'DROP SCHEMA IF EXISTS bedrock_integration CASCADE;',
        },
      },
      policy: this.createRdsDataPolicy(),
      logGroup: new logs.LogGroup(this, 'BedrockSchemaLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      timeout: cdk.Duration.minutes(5),
    });
  }

  /**
   * pgvector拡張機能有効化
   */
  private createExtensionSetup(): AwsCustomResource {
    return new AwsCustomResource(this, 'EnablePgvectorExtension', {
      onCreate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: 'CREATE EXTENSION IF NOT EXISTS vector;',
        },
        physicalResourceId: PhysicalResourceId.of(
          'pgvector-extension-creation'
        ),
      },
      policy: this.createRdsDataPolicy(),
      logGroup: new logs.LogGroup(this, 'BedrockExtensionLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      timeout: cdk.Duration.minutes(5),
    });
  }

  /**
   * bedrock_kbテーブル作成
   */
  private createTableSetup(): AwsCustomResource {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS bedrock_integration.bedrock_kb (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        embedding vector(${RagConfig.VECTOR_DIMENSIONS}) NOT NULL,
        chunks TEXT NOT NULL,
        metadata JSON DEFAULT '{}',
        custom_metadata JSONB DEFAULT '{}'
      );
    `;

    return new AwsCustomResource(this, 'CreateBedrockTable', {
      onCreate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: createTableSql,
        },
        physicalResourceId: PhysicalResourceId.of('bedrock-table-creation'),
      },
      onDelete: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: 'DROP TABLE IF EXISTS bedrock_integration.bedrock_kb;',
        },
      },
      policy: this.createRdsDataPolicy(),
      logGroup: new logs.LogGroup(this, 'BedrockTableLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      timeout: cdk.Duration.minutes(10),
    });
  }

  /**
   * HNSWベクターインデックス作成
   */
  private createVectorIndexSetup(): AwsCustomResource {
    const createVectorIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_bedrock_kb_embedding_cosine 
      ON bedrock_integration.bedrock_kb 
      USING hnsw (embedding vector_cosine_ops) 
      WITH (ef_construction = ${RagConfig.HNSW_INDEX.EF_CONSTRUCTION}, m = ${RagConfig.HNSW_INDEX.M});
    `;

    return new AwsCustomResource(this, 'CreateVectorIndex', {
      onCreate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: createVectorIndexSql,
        },
        physicalResourceId: PhysicalResourceId.of(
          'bedrock-vector-index-creation'
        ),
      },
      onDelete: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: 'DROP INDEX IF EXISTS bedrock_integration.idx_bedrock_kb_embedding_cosine;',
        },
      },
      policy: this.createRdsDataPolicy(),
      logGroup: new logs.LogGroup(this, 'BedrockVectorIndexLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      timeout: cdk.Duration.minutes(15), // インデックス作成は時間がかかる場合がある
    });
  }

  /**
   * GINテキストインデックス作成
   */
  private createTextIndexSetup(): AwsCustomResource {
    const createTextIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_bedrock_kb_chunks_gin 
      ON bedrock_integration.bedrock_kb 
      USING gin (to_tsvector('simple', chunks));
      
      CREATE INDEX IF NOT EXISTS idx_bedrock_kb_custom_metadata_gin 
      ON bedrock_integration.bedrock_kb 
      USING gin (custom_metadata);
    `;

    return new AwsCustomResource(this, 'CreateTextIndex', {
      onCreate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: createTextIndexSql,
        },
        physicalResourceId: PhysicalResourceId.of(
          'bedrock-text-index-creation'
        ),
      },
      onDelete: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: `
            DROP INDEX IF EXISTS bedrock_integration.idx_bedrock_kb_chunks_gin;
            DROP INDEX IF EXISTS bedrock_integration.idx_bedrock_kb_custom_metadata_gin;
          `,
        },
      },
      policy: this.createRdsDataPolicy(),
      logGroup: new logs.LogGroup(this, 'BedrockIndexLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      timeout: cdk.Duration.minutes(10),
    });
  }

  /**
   * bedrock_user用のSecrets Manager シークレット作成
   */
  private createBedrockUserSecret(): secretsmanager.Secret {
    return new secretsmanager.Secret(this, 'BedrockUserSecret', {
      secretName: 'generative-ai-use-cases/bedrock-user-credentials',
      description: 'Bedrock Knowledge Base用のデータベースユーザー認証情報',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'bedrock_user',
        }),
        generateStringKey: 'password',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        includeSpace: false,
        passwordLength: 32,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発用。本番では RETAIN に変更
    });
  }

  /**
   * bedrock_userロール作成
   */
  private createUserSetup(): AwsCustomResource {
    const createUserSql = `
      DO $$
      DECLARE
        user_password TEXT;
      BEGIN
        -- Secrets Managerからパスワードを取得（実際にはCustom Resourceで先に取得してパラメータで渡す）
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bedrock_user') THEN
          CREATE ROLE bedrock_user WITH LOGIN PASSWORD :password;
          GRANT USAGE ON SCHEMA bedrock_integration TO bedrock_user;
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bedrock_integration.bedrock_kb TO bedrock_user;
        END IF;
      END
      $$;
    `;

    return new AwsCustomResource(this, 'CreateBedrockUser', {
      onCreate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: createUserSql,
          parameters: [
            {
              name: 'password',
              value: {
                stringValue: `{{resolve:secretsmanager:${this.bedrockUserSecret.secretName}:SecretString:password}}`,
              },
            },
          ],
        },
        physicalResourceId: PhysicalResourceId.of('bedrock-user-creation'),
      },
      onDelete: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.databaseCluster.clusterArn,
          secretArn: this.databaseSecret.secretArn,
          database: this.databaseName,
          sql: 'DROP ROLE IF EXISTS bedrock_user;',
        },
      },
      policy: this.createRdsDataPolicy(),
      logGroup: new logs.LogGroup(this, 'BedrockUserLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      timeout: cdk.Duration.minutes(5),
    });
  }

  /**
   * RDS Data API用のIAMポリシー作成
   */
  private createRdsDataPolicy(): AwsCustomResourcePolicy {
    return AwsCustomResourcePolicy.fromStatements([
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'rds-data:ExecuteStatement',
          'rds-data:BatchExecuteStatement',
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:RollbackTransaction',
        ],
        resources: [this.databaseCluster.clusterArn],
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          this.databaseSecret.secretArn,
          this.bedrockUserSecret.secretArn,
        ],
      }),
    ]);
  }
}
