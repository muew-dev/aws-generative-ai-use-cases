// L1 Constructs (CloudFormation Resources)
// CloudFormationリソースと1:1で対応する低レベルConstruct
//
// 命名規則: CfnXXX（例：s3.CfnBucket = AWS::S3::Bucket）
// 特徴:
// - すべてのプロパティを明示的に設定する必要がある
// - CloudFormationテンプレートと同じプロパティ名を使用
// - 自動生成される（aws-cdk-lib内で定義済み）
//
// 使用する場面:
// - CloudFormationテンプレートからの移行
// - L2 Constructでサポートされていない新機能の使用
// - 完全な制御が必要な場合
//
// 現在このプロジェクトではL1 Constructは使用していません
