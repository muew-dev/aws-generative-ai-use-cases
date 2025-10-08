// L2 Constructs (AWS Resources)
// 単一のAWSリソースを表すクラスで、デフォルト値や便利なメソッドを提供
//
// 特徴:
// - AWSベストプラクティスに基づいたデフォルト設定
// - 便利なヘルパーメソッド（例：bucket.addLifecycleRule()）
// - リソース間の接続を簡単に設定（例：lambda.grantInvoke()）
//
// L2.5 Constructs も含む:
// - より特定のシナリオに合わせた単一リソースの抽象化
// - 例：aws-lambda-nodejs.NodejsFunction（Node.js Lambda用の特化版）
//
// このプロジェクトで使用中のL2 Constructs:

export * from './api'; // RestApi, NodejsFunction, LambdaIntegration
export * from './auth'; // UserPool, UserPoolClient, IdentityPool
export * from './database'; // Table (DynamoDB)
// web.ts は L3 (patterns) に移動しました
