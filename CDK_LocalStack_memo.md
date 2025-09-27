# CDK LocalStack コマンド解説

LocalStackで使うCDKコマンドの詳細解説です。各コマンドの動作内容、実行タイミング、注意点を説明します。

## 前提知識

### CDK（Cloud Development Kit）とは

- **Infrastructure as Code**ツール
- TypeScriptなどのプログラミング言語でAWSリソースを定義
- 最終的にAWS CloudFormationテンプレートに変換してデプロイ

### CloudFormationとは

**AWS公式のインフラ構築エンジン** - CDKの裏側で動く実行基盤

#### CDKとCloudFormationの関係

```bash
1. あなた: TypeScriptでCDKコード作成
   ↓
2. CDK: CloudFormationテンプレート（JSON）に変換
   ↓
3. CloudFormation: 実際のAWSリソース作成
```

#### CloudFormationの役割

- **順序管理**: リソース依存関係を自動解決
- **一括処理**: 複数リソースを同時管理
- **ロールバック**: 失敗時は自動的に元に戻す
- **再現性**: 同じ環境を何度でも作成可能

#### なぜBootstrapが必要？

CloudFormationが動作するには以下が必要：

1. **テンプレート保存場所**（S3バケット）
2. **実行権限**（IAMロール）
3. **Dockerイメージ保存場所**（ECRレポジトリ）

→ だから「CloudFormation用の基盤構築」がBootstrap

### LocalStackとは

- **AWSサービスのローカルエミュレーター**
- 実際のAWSアカウント不要でAWSサービスをローカル実行
- ポート4566でAWSサービスAPIを提供

### cdklocalとは

- **CDKをLocalStack向けに実行するラッパーツール**
- 通常の`cdk`コマンドを`cdklocal`に変更するだけでLocalStack向けに実行

### cdk.jsonの重要性

**CDKプロジェクトの設定ファイル** - すべてのコマンドがこの設定を参照する

#### 主要な設定項目

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/generative-ai-use-cases.ts", // エントリーポイント
  "context": {
    "hiddenUseCases": {
      // 無効化する機能
      "webContent": true, // Web検索機能を無効
      "image": true, // 画像生成機能を無効
      "video": true // 動画生成機能を無効
    },
    "modelIds": [
      // 使用するAIモデル
      "anthropic.claude-3-sonnet-20240229-v1:0",
      "anthropic.claude-3-haiku-20240307-v1:0"
    ],
    "modelRegion": "us-east-1" // モデルのリージョン
  }
}
```

#### コマンドとcdk.jsonの関係

- **bootstrap/deploy/destroy**: `"app"`で指定されたエントリーポイントを実行
- **synth**: コードをビルドして`context`設定を適用したテンプレートを生成
- **diff**: `context`設定でビルドした結果と既存環境を比較

## コマンドの詳細

### 1. `cdk:localstack:bootstrap`

```bash
cd packages/cdk && source ../../.env && cdklocal bootstrap
```

#### 何をする？

**CDK実行環境の基盤構築**

#### cdk.jsonとの関係

- `cdk.json`の存在確認（ファイルがないとエラー）
- CDKのバージョン互換性チェック
- `"app"`エントリーポイントは使用しない（基盤構築のみ）

#### 具体的な処理

1. **S3バケット作成**: CDKが生成するCloudFormationテンプレートやLambda関数のzipファイルを保存
2. **IAMロール作成**: CloudFormationが実行時に必要な権限を持つロール
3. **ECRレポジトリ作成**: Docker イメージ用Lambda関数で使用

#### 実行タイミング

- **初回のみ1回実行**
- LocalStack環境をリセットした後
- LocalStackの新しいバージョンに更新した後

#### 作成されるリソース

```bash
# 以下のようなリソースが作成される
✓ S3バケット: cdk-hnb659fds-assets-000000000000-us-east-1
✓ IAMロール: cdk-hnb659fds-cfn-exec-role-000000000000-us-east-1
✓ CloudFormationスタック: CDKToolkit
```

---

### 2. `cdk:localstack:deploy`

```bash
cd packages/cdk && source ../../.env && cdklocal deploy --all --require-approval never
```

#### 何をする？

**アプリケーションの全リソースをLocalStackにデプロイ**

#### cdk.jsonとの関係

- `"app"`で指定されたエントリーポイント（`bin/generative-ai-use-cases.ts`）を実行
- `"context"`の設定（hiddenUseCases、modelIds等）を適用
- 無効化された機能はデプロイされない

#### 具体的な処理

1. **TypeScriptコードのビルド**: CDKアプリのコンパイル
2. **CloudFormationテンプレート生成**: TypeScriptコードをJSON形式に変換
3. **アセットのアップロード**: Lambda関数のソースコードをS3にアップロード
4. **CloudFormationスタックの実行**: リソースの作成

#### オプション説明

- `--all`: すべてのスタックをデプロイ
- `--require-approval never`: 手動承認なしで自動デプロイ

#### デプロイされるリソース

```bash
✓ DynamoDB: テーブルなど
✓ Lambda関数: predict, createChat, listChatsなど
✓ API Gateway: REST API エンドポイント
✓ Cognito: ユーザープール（認証）
✓ S3: ファイル保存用バケット
```

---

### 3. `cdk:localstack:diff`

```bash
cd packages/cdk && source ../../.env && cdklocal diff
```

#### 何をする？

**現在のコードと既存の環境の差分を表示**

#### cdk.jsonとの関係

- `"app"`エントリーポイントを実行してテンプレート生成
- `"context"`設定を適用した結果と現在の環境を比較
- LocalStackの実際のリソースと差分計算

#### 具体的な処理

1. **現在のコードをビルド**: 最新のCDKコードをCloudFormationテンプレート生成
2. **既存環境の状態を取得**: LocalStackの現在のリソース状況を調査
3. **差分を計算**: 追加・変更・削除されるリソースを整理

#### 出力例

```bash
Stack GenerativeAiUseCasesStack
Resources
[~] AWS::Lambda::Function predict
 └─ [~] Environment
     └─ [~] .Variables:
         └─ [+] NEW_ENV_VAR: "new-value"

[+] AWS::DynamoDB::Table NewTable
```

#### 実行タイミング

- デプロイ前に変更内容を確認したい時
- 意図しない変更がないかチェック
- レビュー目的

---

### 4. `cdk:localstack:synth`

```bash
cd packages/cdk && source ../../.env && cdklocal synth
```

#### 何をする？

**CDKコードをCloudFormationテンプレートに変換するだけ（デプロイしない）**

#### cdk.jsonとの関係

- `"app"`エントリーポイントを実行
- `"context"`の全設定を適用してテンプレート生成
- 生成内容の確認やデバッグに最適

#### 具体的な処理

1. **TypeScriptコードの実行**: CDKアプリケーションを実行
2. **CloudFormationテンプレート生成**: JSONまたはYAML形式
3. **ファイル出力**: `cdk.out/`フォルダに保存

#### 出力されるファイル

```bash
cdk.out/
├── GenerativeAiUseCasesStack.template.json  # CloudFormationテンプレート
├── asset.xxx/                               # Lambda関数のソースコード
└── manifest.json                            # メタデータ
```

#### 実行タイミング

- 生成されるCloudFormationテンプレートを確認したい時
- 構文エラーの早期発見
- CI/CDパイプラインでの構文チェック

---

### 5. `cdk:localstack:destroy`

```bash
cd packages/cdk && source ../../.env && cdklocal destroy --all --force
```

#### 何をする？

**作成したすべてのリソースを削除**

#### cdk.jsonとの関係

- 既存のCloudFormationスタックを特定
- `"context"`設定は参照しない（既存リソースの削除のみ）
- すべてのスタックを逆順で削除

#### 具体的な処理

1. **CloudFormationスタックの削除**: 逆順でスタック削除
2. **関連リソースの削除**: 各スタックに含まれるすべてのリソースを削除
3. **アセットの削除**: S3に保存されたファイルなども削除

#### オプション説明

- `--all`: すべてのスタックを削除
- `--force`: 確認なしで強制削除

#### 削除されるリソース

```bash
🗑️  Lambda関数: predict, createChatなど
🗑️  API Gateway: REST API
🗑️  DynamoDB: テーブルとデータ全て
🗑️  Cognito: ユーザープール
🗑️  S3: バケットとファイル
```

#### 注意事項

- **データがすべて削除される**
- LocalStackのコンテナを停止しないので他のプロジェクトに影響しない

---

## 開発ワークフロー

### 初期セットアップ

```bash
# 1. LocalStack起動
docker-compose up -d

# 2. 基盤構築（初回のみ）
npm run cdk:localstack:bootstrap

# 3. アプリデプロイ
npm run cdk:localstack:deploy
```

### 開発サイクル

```bash
# 変更内容の確認
npm run cdk:localstack:diff

# 変更をデプロイ
npm run cdk:localstack:deploy

# 全環境をリセット
npm run cdk:localstack:destroy
npm run cdk:localstack:deploy
```

### 確認・検証

```bash
# 生成されるテンプレート確認
npm run cdk:localstack:synth

# リソース状態と差分
npm run cdk:localstack:diff
```

## トラブルシューティング

### よくあるエラーと対処法

#### 1. `Bootstrap stack version X is required, got Y`

```bash
# 解決策: 再ブートストラップ
npm run cdk:localstack:destroy
npm run cdk:localstack:bootstrap
npm run cdk:localstack:deploy
```

#### 2. `Lambda function already exists`

```bash
# 解決策: 完全リセット
docker-compose down -v  # LocalStack完全削除
docker-compose up -d
npm run cdk:localstack:bootstrap
npm run cdk:localstack:deploy
```

#### 3. 環境変数が読み込まれない

```bash
# 確認・設定コマンド
source .env
echo $AWS_REGION  # us-east-1と表示されるはず
echo $AWS_ACCESS_KEY_ID  # testと表示されるはず
```

## 実行時間

| コマンド    | 用途             | 所要時間   | 頻度  |
| ----------- | ---------------- | ---------- | ----- |
| `bootstrap` | 基盤構築         | 初回のみ   | 30秒  |
| `deploy`    | アプリデプロイ   | 開発中     | 1-3分 |
| `diff`      | 変更確認         | 確認時     | 10秒  |
| `synth`     | テンプレート生成 | 検証用     | 10秒  |
| `destroy`   | 完全削除         | リセット時 | 1分   |

以上のコマンドを適切に使い分けることで、LocalStackでの効率的な開発が可能になります。
