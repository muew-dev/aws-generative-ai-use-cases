/**
 * CDK共通定数定義
 * ハードコードされた値と表記揺れを防ぐための一元管理
 */
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

// 環境定数（表記揺れを防ぐ）
export const Environment = {
  DEV: 'dev',
  PROD: 'prod',
} as const;

export type EnvironmentType = (typeof Environment)[keyof typeof Environment];

// Availability Zones
export const AvailabilityZones = {
  AP_NORTHEAST_1A: 'ap-northeast-1a',
  AP_NORTHEAST_1C: 'ap-northeast-1c',
} as const;

// VPC設定
export const VpcConfig = {
  IP_ADDRESS: '10.26.0.0/16',
  SUBNET_CIDR_MASK: 24,
} as const;

// データベース設定
export const DatabaseConfig = {
  NAME: 'generative_ai_db',
  PORT: 5432,
  USERNAME: 'postgres',
  SECRET_NAME: 'generative-ai-use-cases/aurora-credentials',
  BACKUP_RETENTION_DAYS: 7,
  POSTGRES_VERSION: rds.AuroraPostgresEngineVersion.VER_17_5,
  SPEC: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
} as const;

// ECS設定
export const EcsConfig = {
  // Frontend Service
  FRONTEND_CONTAINER_NAME: 'frontend-container',
  FRONTEND_SERVICE_NAME: 'frontend-service',
  FRONTEND_TASK_FAMILY: 'frontend-task',
  FRONTEND_PORT: 3000,
  // Backend Service
  BACKEND_CONTAINER_NAME: 'backend-container',
  BACKEND_SERVICE_NAME: 'backend-service',
  BACKEND_TASK_FAMILY: 'backend-task',
  BACKEND_PORT: 8000,
} as const;

// ALB設定
export const AlbConfig = {
  HEALTH_CHECK: {
    INTERVAL_SECONDS: 30,
    TIMEOUT_SECONDS: 5,
    HEALTHY_THRESHOLD: 2,
    UNHEALTHY_THRESHOLD: 5,
    DEREGISTRATION_DELAY_SECONDS: 30,
  },
} as const;

// Cognito設定
export const CognitoConfig = {
  PASSWORD_POLICY: {
    MIN_LENGTH: 8,
    REQUIRE_LOWERCASE: true,
    REQUIRE_UPPERCASE: true,
    REQUIRE_DIGITS: true,
    REQUIRE_SYMBOLS: false,
  },
  TOKEN_VALIDITY: {
    REFRESH_TOKEN_DAYS: 30,
    ACCESS_TOKEN_HOURS: 1,
    ID_TOKEN_HOURS: 1,
  },
} as const;

// Bedrock設定
export const BedrockConfig = {
  MODELS: {
    CLAUDE_3_5_SONNET: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    // RAG用埋め込みモデル
    TITAN_EMBEDDING_V2: 'amazon.titan-embed-text-v2:0',
  },
  // ARNリスト生成ヘルパー
  getModelArns: (region: string): string[] => [
    `arn:aws:bedrock:${region}::foundation-model/${BedrockConfig.MODELS.CLAUDE_3_5_SONNET}`,
    `arn:aws:bedrock:${region}::foundation-model/${BedrockConfig.MODELS.TITAN_EMBEDDING_V2}`,
  ],
} as const;

// RAG設定（pgvector + Aurora PostgreSQL）
export const RagConfig = {
  // pgvector設定
  PGVECTOR_VERSION: '0.8.0',
  VECTOR_DIMENSIONS: 1024, // Titan Embed Text v2の次元数

  // HNSWインデックス設定
  HNSW_INDEX: {
    EF_CONSTRUCTION: 256, // インデックス構築時の探索幅（デフォルト推奨値）
    M: 16, // 各ノードの最大接続数（デフォルト推奨値）
    EF_SEARCH: 40, // 検索時の探索幅（デフォルト推奨値）
  },

  // ベクター検索設定
  SEARCH: {
    DEFAULT_MAX_RESULTS: 10,
    DEFAULT_CONFIDENCE_THRESHOLD: 0.7,
    DISTANCE_FUNCTION: 'vector_cosine_ops', // コサイン類似度
  },

  // チャンキング設定
  CHUNKING: {
    CHUNK_SIZE: 1000, // 文字数
    CHUNK_OVERLAP: 200, // オーバーラップ文字数
  },

  // テーブル・インデックス名
  TABLE_NAMES: {
    VECTOR_TABLE: 'rag_vectors',
    DOCUMENTS_TABLE: 'rag_documents',
  },

  // 埋め込み設定
  EMBEDDING: {
    MODEL: BedrockConfig.MODELS.TITAN_EMBEDDING_V2,
    BATCH_SIZE: 25, // Bedrock APIの制限を考慮
    MAX_INPUT_LENGTH: 8192, // Titan Embed v2の最大入力長
  },
} as const;

// S3設定
export const S3Config = {
  RAG_DOCUMENTS_BUCKET_PREFIX: 'gen-ai-rag-docs',
  DOCUMENTS_PREFIX: 'documents/',
  SUPPORTED_FORMATS: ['pdf', 'txt', 'docx', 'md'] as const,
  MAX_FILE_SIZE_MB: 10,
} as const;

export const Constants = {
  PROJECT_NAME: 'generative-ai-use-cases',
  ALB_NAME: 'generative-ai-use-cases-alb',
  USER_POOL_CLIENT_NAME: 'generative-ai-use-cases-user-pool-client',
} as const;
