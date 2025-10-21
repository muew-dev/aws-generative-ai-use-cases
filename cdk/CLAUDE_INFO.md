# CDK Directory Structure Guide

このドキュメントでは、他のプロジェクトでも再利用可能なCDK（AWS Cloud Development Kit）のディレクトリ構造とアーキテクチャパターンについて説明します。

## ディレクトリ構造

```
cdk/
├── bin/
│   └── app-name.ts                    # CDKアプリケーションのエントリポイント
├── lib/
│   ├── construct/
│   │   ├── aws-resources/             # L2 Constructs (単一AWSリソース)
│   │   │   ├── api.ts                # 例: REST API関連リソース
│   │   │   ├── auth.ts               # 例: 認証関連リソース
│   │   │   ├── database.ts           # 例: データベース関連リソース
│   │   │   └── index.ts              # L2 Constructsのexport
│   │   ├── cfn-resources/             # L1 Constructs (CloudFormationリソース)
│   │   │   └── index.ts              # L1 Constructsのexport
│   │   ├── patterns/                  # L3 Constructs (複雑なパターン)
│   │   │   ├── web.ts                # 例: 静的サイトホスティングパターン
│   │   │   └── index.ts              # L3 Constructsのexport
│   │   └── index.ts                  # 全Constructsの統一export
│   ├── stacks/
│   │   ├── create-stacks.ts          # Stack作成のヘルパー関数
│   │   └── main-stack.ts             # メインのStackクラス
│   └── utils/
│       ├── stack-input.ts            # Stackパラメータの型定義とバリデーション
│       └── stack-input-backup.ts     # バックアップ用設定
├── test/
│   ├── __snapshots__/                # CDKテストのスナップショット
│   │   └── main.test.ts.snap
│   ├── main.test.ts                  # Stack/Constructのテスト
│   └── snapshot-plugin.ts            # テスト設定のプラグイン
├── parameter.ts                      # アプリケーション全体のパラメータ設定
├── consts.ts                        # 定数定義
├── cdk.json                         # CDKの設定ファイル
├── package.json                     # プロジェクト依存関係
├── tsconfig.json                    # TypeScript設定
└── jest.config.ts                   # テスト設定
```

## L1/L2/L3 Constructのレベル別分類

### L1 Constructs (cfn-resources/)

- **概要**: CloudFormationリソースと1:1対応する低レベルConstruct
- **命名規則**: `CfnXXX`（例：`s3.CfnBucket` = `AWS::S3::Bucket`）
- **特徴**:
  - すべてのプロパティを明示的に設定する必要がある
  - CloudFormationテンプレートと同じプロパティ名を使用
  - aws-cdk-lib内で自動生成される
- **使用場面**:
  - CloudFormationテンプレートからの移行
  - L2 Constructでサポートされていない新機能の使用
  - 完全な制御が必要な場合

### L2 Constructs (aws-resources/)

- **概要**: 単一のAWSリソースを表すクラス。デフォルト値や便利なメソッドを提供
- **特徴**:
  - AWSベストプラクティスに基づいたデフォルト設定
  - 便利なヘルパーメソッド（例：`bucket.addLifecycleRule()`）
  - リソース間の接続を簡単に設定（例：`lambda.grantInvoke()`）
- **L2.5 Constructsも含む**:
  - より特定のシナリオに合わせた単一リソースの抽象化
  - 例：`aws-lambda-nodejs.NodejsFunction`（Node.js Lambda用の特化版）
- **例**:
  - `api.ts`: RestApi、NodejsFunction、LambdaIntegration
  - `auth.ts`: UserPool、UserPoolClient、IdentityPool
  - `database.ts`: Table (DynamoDB)

### L3 Constructs (patterns/)

- **概要**: 複数のAWSリソースを含む一般的な構成パターンを抽象化
- **特徴**:
  - 完全に機能する複雑なアーキテクチャ
  - 最小限の設定で動作する完成されたソリューション
  - 特定のビジネス要件やユースケースに最適化
- **例**:
  - `aws-ecs-patterns.LoadBalancedFargateService`
  - `@aws-solutions-constructs/aws-cloudfront-s3`
  - `web.ts`: CloudFrontToS3の静的サイトホスティング完全パターン

## Stack構成パターン

### アプリケーションエントリポイント (`bin/app-name.ts`)

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getParams } from '../parameter';
import { MainStack } from '../lib/stacks/main-stack';

const app = new cdk.App();
const params = getParams(app);

// グローバルタグの適用
if (params.tagValue) {
  cdk.Tags.of(app).add('TagKey', params.tagValue);
}

new MainStack(app, 'MainStack', {
  params: params,
});
```

### メインStack (`lib/stacks/main-stack.ts`)

```typescript
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Auth, Api, Database } from '../construct/aws-resources';
import { Web } from '../construct/patterns';

export interface MainStackProps extends StackProps {
  readonly params: ProcessedStackInput;
}

export class MainStack extends Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    // L2 Constructsの使用例
    const auth = new Auth(this, 'Auth', {
      /* config */
    });
    const database = new Database(this, 'Database');
    const api = new Api(this, 'API', {
      /* config */
    });

    // L3 Constructsの使用例
    const web = new Web(this, 'Web', {
      /* config */
    });
  }
}
```

## 設定とパラメータ管理

### parameter.ts

```typescript
export interface StackInput {
  // アプリケーション固有のパラメータを定義
}

export function getParams(app: cdk.App): ProcessedStackInput {
  // CDKコンテキストからパラメータを取得・バリデーション
}
```

## テスト戦略

### Jest設定 (`jest.config.ts`)

```typescript
export default {
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  // CDK特有のテスト設定
};
```

### スナップショットテスト例

```typescript
import { Template } from 'aws-cdk-lib/assertions';
import { MainStack } from '../lib/stacks/main-stack';

test('Stack creates expected resources', () => {
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::S3::Bucket', {
    // 期待するプロパティ
  });
});
```

## 他プロジェクトでの活用方法

1. **ディレクトリ構造をコピー**: 基本的なフォルダ構成を再利用
2. **Constructレベルの選択**: プロジェクトの複雑さに応じてL1/L2/L3を選択
3. **パラメータ管理の適用**: `parameter.ts`パターンで設定を管理
4. **テスト戦略の採用**: スナップショットテストとユニットテストの組み合わせ
5. **命名規則の統一**: ファイル名とクラス名の規則を維持

## 注意事項

- 具体的なAWSリソース（S3、ALB等）の設定はプロジェクトによって異なるため、あくまで構造パターンとして参考にしてください
- L1/L2/L3の選択は、プロジェクトの要件と開発チームの経験に基づいて決定してください
- セキュリティ設定やコンプライアンス要件は、各プロジェクトの要求に合わせて調整が必要です
