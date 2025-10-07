// L1 Constructs (CloudFormation Resources - CfnXXX)
// CloudFormationと1:1対応の低レベルConstruct
// export * from './cfn-resources';

// L2 Constructs (AWS Resources - 単一リソースの抽象化)
// デフォルト値と便利なメソッドを提供
export * from './aws-resources/api';
export * from './aws-resources/auth';
export * from './aws-resources/database';

// L3 Constructs (Patterns - 複数リソースの完成されたソリューション)
// 一般的な構成パターンを抽象化
export * from './patterns/web';
