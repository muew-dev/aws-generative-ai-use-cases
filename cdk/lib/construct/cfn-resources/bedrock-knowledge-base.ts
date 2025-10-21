import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BedrockKnowledgeBaseProps {
  readonly name: string;
  readonly description: string;
  readonly roleArn: string;
  readonly storageConfiguration: {
    type:
      | 'OPENSEARCH_SERVERLESS'
      | 'PINECONE'
      | 'REDIS_ENTERPRISE_CLOUD'
      | 'RDS';
    opensearchServerlessConfiguration?: {
      collectionArn: string;
      vectorIndexName: string;
      fieldMapping: {
        vectorField: string;
        textField: string;
        metadataField: string;
      };
    };
    rdsConfiguration?: {
      resourceArn: string;
      credentialsSecretArn: string;
      databaseName: string;
      tableName: string;
      fieldMapping: {
        primaryKeyField: string;
        vectorField: string;
        textField: string;
        metadataField: string;
      };
    };
  };
  readonly tags?: { [key: string]: string };
}

export interface BedrockDataSourceProps {
  readonly knowledgeBaseId: string;
  readonly name: string;
  readonly description?: string;
  readonly dataSourceConfiguration: {
    type: 'S3';
    s3Configuration: {
      bucketArn: string;
      inclusionPrefixes?: string[];
      bucketOwnerAccountId?: string;
    };
  };
  readonly vectorIngestionConfiguration?: {
    chunkingConfiguration?: {
      chunkingStrategy: 'FIXED_SIZE' | 'NONE';
      fixedSizeChunkingConfiguration?: {
        maxTokens: number;
        overlapPercentage: number;
      };
    };
  };
  readonly tags?: { [key: string]: string };
}

/**
 * Bedrock Knowledge Base L1 Construct
 * CloudFormation CfnKnowledgeBase の薄いWrapper
 */
export class BedrockKnowledgeBase extends Construct {
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly knowledgeBaseId: string;
  public readonly knowledgeBaseArn: string;

  private readonly props: BedrockKnowledgeBaseProps;

  constructor(scope: Construct, id: string, props: BedrockKnowledgeBaseProps) {
    super(scope, id);
    this.props = props;

    // CloudFormation Knowledge Base直接作成
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: props.name,
      description: props.description,
      roleArn: props.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: this.getEmbeddingModelArn(),
        },
      },
      storageConfiguration: props.storageConfiguration,
      tags: this.buildTagsObject(props.tags),
    });

    this.knowledgeBaseId = this.knowledgeBase.attrKnowledgeBaseId;
    this.knowledgeBaseArn = this.knowledgeBase.attrKnowledgeBaseArn;
  }

  /**
   * Embedding Model ARNを取得（リージョン別）
   */
  private getEmbeddingModelArn(): string {
    const region = cdk.Stack.of(this).region;
    return `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`;
  }

  /**
   * タグオブジェクトを構築
   */
  private buildTagsObject(customTags?: { [key: string]: string }): {
    [key: string]: string;
  } {
    const baseTags = {
      ManagedBy: 'CDK',
      Name: this.props.name,
    };

    return customTags ? { ...baseTags, ...customTags } : baseTags;
  }

  /**
   * Knowledge Base IDを取得
   */
  public getKnowledgeBaseId(): string {
    return this.knowledgeBaseId;
  }

  /**
   * Knowledge Base ARNを取得
   */
  public getKnowledgeBaseArn(): string {
    return this.knowledgeBaseArn;
  }

  /**
   * Knowledge Base名を取得
   */
  public getKnowledgeBaseName(): string {
    return this.props.name;
  }

  /**
   * Knowledge Base情報を取得
   */
  public getKnowledgeBaseInfo(): {
    id: string;
    arn: string;
    name: string;
    description: string;
    embeddingModel: string;
    storageType: string;
  } {
    return {
      id: this.knowledgeBaseId,
      arn: this.knowledgeBaseArn,
      name: this.props.name,
      description: this.props.description,
      embeddingModel: this.getEmbeddingModelArn(),
      storageType: this.props.storageConfiguration.type,
    };
  }

  /**
   * CloudFormation Outputとして情報を出力
   */
  public createOutputs(outputPrefix: string = ''): void {
    const prefix = outputPrefix ? `${outputPrefix}` : '';

    new cdk.CfnOutput(this, `${prefix}KnowledgeBaseId`, {
      value: this.knowledgeBaseId,
      description: `Bedrock Knowledge Base ID: ${this.props.name}`,
    });

    new cdk.CfnOutput(this, `${prefix}KnowledgeBaseArn`, {
      value: this.knowledgeBaseArn,
      description: `Bedrock Knowledge Base ARN: ${this.props.name}`,
    });
  }
}

/**
 * Bedrock Data Source L1 Construct
 * CloudFormation CfnDataSource の薄いWrapper
 */
export class BedrockDataSource extends Construct {
  public readonly dataSource: bedrock.CfnDataSource;
  public readonly dataSourceId: string;

  private readonly props: BedrockDataSourceProps;

  constructor(scope: Construct, id: string, props: BedrockDataSourceProps) {
    super(scope, id);
    this.props = props;

    // CloudFormation Data Source直接作成
    this.dataSource = new bedrock.CfnDataSource(this, 'DataSource', {
      knowledgeBaseId: props.knowledgeBaseId,
      name: props.name,
      description: props.description,
      dataSourceConfiguration: props.dataSourceConfiguration,
      vectorIngestionConfiguration: props.vectorIngestionConfiguration ?? {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 1000,
            overlapPercentage: 20,
          },
        },
      },
    });

    // タグをCDKレベルで設定
    const tags = this.buildTagsObject(props.tags);
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.dataSource).add(key, value);
    });

    this.dataSourceId = this.dataSource.attrDataSourceId;
  }

  /**
   * タグオブジェクトを構築
   */
  private buildTagsObject(customTags?: { [key: string]: string }): {
    [key: string]: string;
  } {
    const baseTags = {
      ManagedBy: 'CDK',
      Name: this.props.name,
    };

    return customTags ? { ...baseTags, ...customTags } : baseTags;
  }

  /**
   * Data Source IDを取得
   */
  public getDataSourceId(): string {
    return this.dataSourceId;
  }

  /**
   * Data Source名を取得
   */
  public getDataSourceName(): string {
    return this.props.name;
  }

  /**
   * Data Source情報を取得
   */
  public getDataSourceInfo(): {
    id: string;
    name: string;
    knowledgeBaseId: string;
    dataSourceType: string;
    s3BucketArn?: string;
  } {
    return {
      id: this.dataSourceId,
      name: this.props.name,
      knowledgeBaseId: this.props.knowledgeBaseId,
      dataSourceType: this.props.dataSourceConfiguration.type,
      s3BucketArn:
        this.props.dataSourceConfiguration.s3Configuration?.bucketArn,
    };
  }

  /**
   * CloudFormation Outputとして情報を出力
   */
  public createOutputs(outputPrefix: string = ''): void {
    const prefix = outputPrefix ? `${outputPrefix}` : '';

    new cdk.CfnOutput(this, `${prefix}DataSourceId`, {
      value: this.dataSourceId,
      description: `Bedrock Data Source ID: ${this.props.name}`,
    });

    if (this.props.dataSourceConfiguration.s3Configuration) {
      new cdk.CfnOutput(this, `${prefix}S3BucketArn`, {
        value: this.props.dataSourceConfiguration.s3Configuration.bucketArn,
        description: `S3 Bucket ARN for Data Source: ${this.props.name}`,
      });
    }
  }
}

/**
 * Bedrock Knowledge Base用IAMロール作成ヘルパー
 */
export class BedrockKnowledgeBaseRole extends Construct {
  public readonly role: iam.Role;

  constructor(
    scope: Construct,
    id: string,
    props: {
      roleName: string;
      s3BucketArn: string;
      rdsClusterArn?: string;
      rdsSecretArn?: string;
      environment?: string;
    }
  ) {
    super(scope, id);

    // Bedrock Knowledge Base用のサービスロール
    this.role = new iam.Role(this, 'Role', {
      roleName: props.roleName,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'IAM role for Bedrock Knowledge Base',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
      ],
      inlinePolicies: {
        BedrockKnowledgeBasePolicy: new iam.PolicyDocument({
          statements: [
            // S3アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject', 's3:ListBucket'],
              resources: [props.s3BucketArn, `${props.s3BucketArn}/*`],
            }),
            // RDS Data API権限（PostgreSQL用）
            ...(props.rdsClusterArn && props.rdsSecretArn
              ? [
                  new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                      'rds-data:ExecuteStatement',
                      'rds-data:BatchExecuteStatement',
                      'rds-data:BeginTransaction',
                      'rds-data:CommitTransaction',
                      'rds-data:RollbackTransaction',
                    ],
                    resources: [props.rdsClusterArn],
                  }),
                  new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                      'secretsmanager:GetSecretValue',
                      'secretsmanager:DescribeSecret',
                    ],
                    resources: [props.rdsSecretArn],
                  }),
                ]
              : []),
            // Bedrock基本権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
              ],
              resources: [
                `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`,
              ],
            }),
          ],
        }),
      },
    });

    // タグをCDKレベルで設定
    cdk.Tags.of(this.role).add('ManagedBy', 'CDK');
    cdk.Tags.of(this.role).add('Purpose', 'BedrockKnowledgeBase');
    cdk.Tags.of(this.role).add('Environment', props.environment || 'unknown');
  }

  /**
   * IAMロールARNを取得
   */
  public getRoleArn(): string {
    return this.role.roleArn;
  }
}

