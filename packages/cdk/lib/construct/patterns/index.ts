// L3 Constructs (Patterns)
// 複数のAWSリソースを含む一般的な構成パターンを抽象化
//
// 特徴:
// - 完全に機能する複雑なアーキテクチャ
// - 最小限の設定で動作する完成されたソリューション
// - 特定のビジネス要件やユースケースに最適化
//
// 例:
// - aws-ecs-patterns.LoadBalancedFargateService
// - @aws-solutions-constructs/aws-cloudfront-s3
//
// このプロジェクトで使用中のL3 Patterns:

export * from './web'; // CloudFrontToS3: 静的サイトホスティングの完全パターン
