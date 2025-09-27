import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts';
import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockAgentRuntimeClient,
  BedrockAgentRuntimeClientConfig,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import {
  BedrockAgentClient,
  BedrockAgentClientConfig,
} from '@aws-sdk/client-bedrock-agent';

// クロスアカウントアクセス用の一時認証情報
const stsClient = new STSClient();
let temporaryCredentials: Credentials | undefined;

// Bedrockクライアントを保存
const bedrockRuntimeClient: Record<string, BedrockRuntimeClient> = {};
const bedrockAgentClient: Record<string, BedrockAgentClient> = {};
const bedrockAgentRuntimeClient: Record<string, BedrockAgentRuntimeClient> = {};
const knowledgeBaseS3Client: Record<string, S3Client> = {};

// STSから一時認証情報を取得する関数
const assumeRole = async (crossAccountBedrockRoleArn: string) => {
  const command = new AssumeRoleCommand({
    RoleArn: crossAccountBedrockRoleArn,
    RoleSessionName: 'BedrockApiAccess',
  });
  try {
    const response = await stsClient.send(command);
    if (response.Credentials) {
      temporaryCredentials = response.Credentials;
    } else {
      throw new Error('Failed to get credentials.');
    }
  } catch (error) {
    console.error('Error assuming role: ', error);
    throw error;
  }
};

// 一時認証情報が1分以内に期限切れするかチェック
const isCredentialRefreshRequired = () => {
  return (
    !temporaryCredentials?.Expiration || // 期限が未定義
    temporaryCredentials.Expiration.getTime() - Date.now() < 60_000 // 期限が1分未満
  );
};

// クロスアカウントアクセス用のAWS認証情報を取得
// 指定されたロールを仮定し、取得した一時認証情報が有効かチェック
// これにより、異なAWSアカウントのAWSリソースへのアクセスが可能
const getCrossAccountCredentials = async (
  crossAccountBedrockRoleArn: string
) => {
  // STSから一時認証情報を取得し、クライアントを初期化
  if (isCredentialRefreshRequired()) {
    await assumeRole(crossAccountBedrockRoleArn);
  }
  if (
    !temporaryCredentials ||
    !temporaryCredentials.AccessKeyId ||
    !temporaryCredentials.SecretAccessKey ||
    !temporaryCredentials.SessionToken
  ) {
    throw new Error('The temporary credentials from STS are incomplete.');
  }
  return {
    credentials: {
      accessKeyId: temporaryCredentials.AccessKeyId,
      secretAccessKey: temporaryCredentials.SecretAccessKey,
      sessionToken: temporaryCredentials.SessionToken,
    },
  };
};

export const initBedrockRuntimeClient = async (
  config: BedrockRuntimeClientConfig & { region: string }
) => {
  // クロスアカウントロールを使用
  if (process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN) {
    return new BedrockRuntimeClient({
      ...(await getCrossAccountCredentials(
        process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN
      )),
      ...config,
    });
  }
  // Lambda実行ロールを使用
  if (!(config.region in bedrockRuntimeClient)) {
    bedrockRuntimeClient[config.region] = new BedrockRuntimeClient(config);
  }
  return bedrockRuntimeClient[config.region];
};

export const initBedrockAgentClient = async (
  config: BedrockAgentClientConfig & { region: string }
) => {
  // クロスアカウントロールを使用
  if (process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN) {
    return new BedrockAgentClient({
      ...(await getCrossAccountCredentials(
        process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN
      )),
      ...config,
    });
  }
  // Lambda実行ロールを使用
  if (!(config.region in bedrockAgentClient)) {
    bedrockAgentClient[config.region] = new BedrockAgentClient(config);
  }
  return bedrockAgentClient[config.region];
};

export const initBedrockAgentRuntimeClient = async (
  config: BedrockAgentRuntimeClientConfig & { region: string }
) => {
  // クロスアカウントロールを使用
  if (process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN) {
    return new BedrockAgentRuntimeClient({
      ...(await getCrossAccountCredentials(
        process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN
      )),
      ...config,
    });
  }
  // Lambda実行ロールを使用
  if (!(config.region in bedrockAgentRuntimeClient)) {
    bedrockAgentRuntimeClient[config.region] = new BedrockAgentRuntimeClient(
      config
    );
  }
  return bedrockAgentRuntimeClient[config.region];
};

export const initKnowledgeBaseS3Client = async (
  config: S3ClientConfig & { region: string }
) => {
  // クロスアカウントロールを使用 (to get pre-signed URLs for S3 objects in a different account)
  if (process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN) {
    return new S3Client({
      ...(await getCrossAccountCredentials(
        process.env.CROSS_ACCOUNT_BEDROCK_ROLE_ARN
      )),
      ...config,
    });
  }
  // Lambda実行ロールを使用
  if (!(config.region in knowledgeBaseS3Client)) {
    knowledgeBaseS3Client[config.region] = new S3Client(config);
  }
  return knowledgeBaseS3Client[config.region];
};
