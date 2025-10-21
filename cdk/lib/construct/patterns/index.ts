// L3 Constructs (複雑なパターン) のエクスポート
// 新アーキテクチャではECS Fargate + ALB + NLBを使用

export { BedrockRag } from './bedrock-rag';
export { RdsKnowledgeBaseSetup } from './rds-knowledge-base-setup';
export { MultiAzNetwork } from './multi-az-network';
export { FargateWorkload } from './fargate-workload';
export { AuroraDatabase } from './aurora-database';
export { WebApplication } from './web-application';
