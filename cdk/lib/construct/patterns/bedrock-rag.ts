import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { DatabaseConfig } from '../../constants';
import { RdsKnowledgeBaseSetup } from './rds-knowledge-base-setup';
import { BedrockKnowledgeBase, BedrockDataSource, BedrockKnowledgeBaseRole } from '../cfn-resources';

export interface BedrockRagProps {
  readonly vpc: ec2.IVpc;
  readonly databaseCluster: rds.IDatabaseCluster;
  readonly databaseSecret: secretsmanager.ISecret;
  readonly documentsS3Bucket: s3.IBucket;
  readonly environment: string;
  // Data API設定情報（Aurora Database から取得）
  readonly dataApiConfig: {
    clusterArn: string;
    secretArn: string;
    databaseName: string;
    isEnabled: boolean;
  };
}

/**
 * Bedrock RAG統合コンストラクト
 * Aurora PostgreSQL + pgvector + Bedrock Knowledge Base + S3 DataSource
 */
export class BedrockRag extends Construct {
  public readonly rdsDataSetup: RdsKnowledgeBaseSetup;
  public readonly knowledgeBaseRole: BedrockKnowledgeBaseRole;
  public readonly knowledgeBase: BedrockKnowledgeBase;
  public readonly s3DataSource: BedrockDataSource;
  private readonly props: BedrockRagProps;

  constructor(scope: Construct, id: string, props: BedrockRagProps) {
    super(scope, id);
    
    // プロパティを保存
    this.props = props;

    // 1. RDS Knowledge Base Setup（テーブル・インデックス・ユーザー作成）
    this.rdsDataSetup = new RdsKnowledgeBaseSetup(this, 'RdsKnowledgeBaseSetup', {
      databaseCluster: props.databaseCluster,
      databaseSecret: props.databaseSecret,
      databaseName: DatabaseConfig.NAME,
    });

    // 2. Bedrock Knowledge Base用のIAMロール作成 - L1 Construct使用
    this.knowledgeBaseRole = new BedrockKnowledgeBaseRole(this, 'KnowledgeBaseRole', {
      roleName: `bedrock-kb-role-${props.environment}`,
      s3BucketArn: props.documentsS3Bucket.bucketArn,
      rdsClusterArn: props.dataApiConfig.clusterArn,
      rdsSecretArn: this.rdsDataSetup.bedrockUserSecret.secretArn,
      environment: props.environment,
    });

    // 3. Bedrock Knowledge Base作成 - L1 Construct使用
    this.knowledgeBase = new BedrockKnowledgeBase(this, 'KnowledgeBase', {
      name: `generative-ai-rag-kb-${props.environment}`,
      description: `Generative AI RAG Knowledge Base for ${props.environment} environment`,
      roleArn: this.knowledgeBaseRole.getRoleArn(),
      storageConfiguration: {
        type: 'RDS',
        rdsConfiguration: {
          resourceArn: props.dataApiConfig.clusterArn,
          credentialsSecretArn: this.rdsDataSetup.bedrockUserSecret.secretArn,
          databaseName: DatabaseConfig.NAME,
          tableName: 'bedrock_kb',
          fieldMapping: {
            primaryKeyField: 'id',
            vectorField: 'embedding',
            textField: 'chunks',
            metadataField: 'metadata',
          },
        },
      },
      tags: {
        Environment: props.environment,
        Purpose: 'RAG',
      },
    });

    // 4. S3 Data Source設定 - L1 Construct使用
    this.s3DataSource = new BedrockDataSource(this, 'S3DataSource', {
      knowledgeBaseId: this.knowledgeBase.getKnowledgeBaseId(),
      name: `s3-datasource-${props.environment}`,
      description: '文書アップロード用S3データソース',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.documentsS3Bucket.bucketArn,
          inclusionPrefixes: ['documents/'],
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 512,
            overlapPercentage: 20,
          },
        },
      },
      tags: {
        Environment: props.environment,
        Purpose: 'RAG-DataSource',
      },
    });

    // 依存関係の設定
    this.knowledgeBase.node.addDependency(this.rdsDataSetup.userSetup);
    this.s3DataSource.node.addDependency(this.knowledgeBase);

    // タグ設定
    cdk.Tags.of(this).add('Component', 'RAG');
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Service', 'Bedrock-Knowledge-Base');
  }

  /**
   * Knowledge Base IDを取得
   */
  public getKnowledgeBaseId(): string {
    return this.knowledgeBase.getKnowledgeBaseId();
  }

  /**
   * Knowledge Base ARNを取得
   */
  public getKnowledgeBaseArn(): string {
    return this.knowledgeBase.getKnowledgeBaseArn();
  }

  /**
   * Data Source IDを取得
   */
  public getDataSourceId(): string {
    return this.s3DataSource.getDataSourceId();
  }

  /**
   * Aurora Vector Store情報を取得
   */
  public getVectorStoreInfo() {
    return {
      clusterArn: this.props.dataApiConfig.clusterArn,
      databaseName: DatabaseConfig.NAME,
      tableName: 'bedrock_kb',
      schemaName: 'bedrock_integration',
      secretArn: this.rdsDataSetup.bedrockUserSecret.secretArn,
    };
  }
}
