# LocalStack + CDK開発環境構築ガイド

このドキュメントでは、AWS Generative AI Use Cases（GenU）プロジェクトをLocalStack環境でCDKを使ってローカル開発する手順を説明します。

## 前提条件

- Docker Desktop がインストールされていること
- Node.js 24.8.0以上がインストールされていること（推奨: Node.jsバージョン管理ツールを使用）
- AWS CLI がインストールされていること
- cdklocal（LocalStack用CDK CLI）がインストールされていること

### Node.jsバージョン管理（nodenv使用必須）

このプロジェクトはNode.js 24.8.0（npm 11.6.0）を使用します。チーム全員が同じ環境で開発するため、**nodenvの使用を必須**とします。

#### nodenvのセットアップ手順

```bash
# 1. nodenvのインストール（macOS）
brew install nodenv

# 2. シェル設定
echo 'eval "$(nodenv init -)"' >> ~/.zshrc
source ~/.zshrc

# 3. nodenvの動作確認
nodenv --version

# 4. プロジェクトディレクトリで指定バージョンをインストール
cd /path/to/aws-generative-ai-use-cases
nodenv install  # .node-versionファイルから自動的に24.8.0を読み込みインストール

# 5. バージョンの確認
node --version   # v24.8.0と表示されるはず
npm --version    # v11.6.0と表示されるはず

# 便利なコマンド
nodenv versions     # インストール済みバージョン一覧
nodenv local        # 現在のプロジェクトのバージョン確認
nodenv global 24.8.0  # グローバルデフォルトの設定（オプション）
```

**注意事項：**

- `.node-version`ファイルがプロジェクトルートに存在し、Node.js 24.8.0が指定されています
- プロジェクトディレクトリに入ると自動的にNode.js 24.8.0に切り替わります
- 他のバージョン管理ツール（nvm、asdf等）は使用しないでください

## LocalStack概要

LocalStackは、AWSクラウドサービスをローカル環境でエミュレートするツールです。このプロジェクトでは以下のAWSサービスを使用します：

### サポート対象サービス（LocalStack Community Edition）

- **Lambda** - サーバーレス関数実行
- **API Gateway** - REST API エンドポイント
- **DynamoDB** - NoSQLデータベース
- **S3** - オブジェクトストレージ
- **CloudFormation** - インフラストラクチャ as Code
- **Cognito** - ユーザー認証・認可
- **IAM** - アクセス制御
- **CloudWatch** - ログ監視

### 制限事項

以下のサービスはLocalStackで完全にサポートされていないため、このプロジェクトから除外されています：

- Amazon Bedrock（AI/MLサービス）
- Amazon Kendra（検索サービス）
- Amazon Transcribe（音声認識）
- AWS WAF（Web Application Firewall）

## 1. 必要なツールのインストール

### LocalStack CLI のインストール（macOS）

```bash
# Homebrewを使用してLocalStackをインストール
brew install localstack/tap/localstack-cli

# インストール確認
localstack --version
```

### cdklocal のインストール

`cdklocal`は、AWS CDKをLocalStackで使用するためのラッパーツールです。

```bash
# 前提条件：Node.js 24.8.0以上がインストールされていること
node --version  # v24.8.0以上であることを確認
npm --version   # v11.6.0以上であることを確認

# aws-cdkとaws-cdk-localをグローバルインストール
npm install -g aws-cdk-local aws-cdk

# インストール確認
cdk --version      # AWS CDKのバージョン確認
cdklocal --version # cdklocalのバージョン確認
```

**重要：** `cdklocal`は必ずグローバルインストールが必要です。ローカルインストール（プロジェクト依存関係）では正常に動作しません。

#### cdklocalの仕組み

`cdklocal`は以下の環境変数を自動的に設定してCDKコマンドを実行します：

- `AWS_ENDPOINT_URL=http://localhost:4566`
- `AWS_ACCESS_KEY_ID=test`
- `AWS_SECRET_ACCESS_KEY=test`
- `AWS_REGION=us-east-1`

これにより、LocalStackに対してCDK操作を行うことができます。

## 2. LocalStackの起動

### 設定ファイルの作成

プロジェクトルートに `docker-compose.yml` を作成：

```yaml
version: '3.8'

services:
  localstack:
    container_name: 'localstack-genu'
    image: localstack/localstack:3.0
    ports:
      - '127.0.0.1:4566:4566' # LocalStack Gateway
      - '127.0.0.1:4510-4559:4510-4559' # external services port range
    environment:
      - DEBUG=1
      - LAMBDA_EXECUTOR=docker-reuse
      - LAMBDA_REMOVE_CONTAINERS=true
      - DOCKER_HOST=unix:///var/run/docker.sock
      # Lambda関数のデバッグ用設定
      - LAMBDA_DOCKER_NETWORK=bridge
      - LAMBDA_RUNTIME_ENVIRONMENT_TIMEOUT=60
    volumes:
      - '${LOCALSTACK_VOLUME_DIR:-./localstack-data}:/var/lib/localstack'
      - '/var/run/docker.sock:/var/run/docker.sock'
      # Lambda関数のソースコードをマウント（ホットリロード用）
      - '${PWD}/packages/cdk/lambda:/opt/code/lambda:ro'
```

### LocalStackの起動

```bash
# バックグラウンドで起動
docker-compose up -d

# ログ確認
docker-compose logs -f localstack
```

## 3. 環境変数設定

プロジェクトルートの`.env`ファイルが作成されています：

```bash
# Docker Compose用環境変数
LOCALSTACK_VOLUME_DIR=./localstack-data

# ホスト側CDK用（要: source .env）
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
CDK_DEFAULT_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=000000000000
```

**重要：** CDK操作前に毎回`source .env`を実行してください。

## 4. Bedrockモックサーバーの設定

LocalStackではBedrockがサポートされていないため、モックサーバーを構築する必要があります。

### プロジェクトルートに `bedrock-mock` ディレクトリを作成：

```bash
mkdir bedrock-mock
cd bedrock-mock
```

### `package.json` を作成：

```json
{
  "name": "bedrock-mock",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
```

### `server.js` を作成：

```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Bedrock Invoke Model API Mock
app.post('/model/*/invoke', (req, res) => {
  const { body } = req.body;
  const parsedBody = JSON.parse(body);

  // Claude Anthropicモデルのレスポンスをモック
  const mockResponse = {
    completion: `これはモックレスポンスです。入力: ${parsedBody.prompt}`,
    stop_reason: 'stop_sequence',
    stop_sequence: '\\n\\nHuman:',
  };

  res.json(mockResponse);
});

// Bedrock Invoke Model Stream API Mock
app.post('/model/*/invoke-with-response-stream', (req, res) => {
  res.setHeader('Content-Type', 'application/x-amzn-eventstream');
  res.setHeader('Transfer-Encoding', 'chunked');

  const mockChunks = ['これは', 'モック', 'ストリーム', 'レスポンス', 'です。'];

  let index = 0;
  const interval = setInterval(() => {
    if (index < mockChunks.length) {
      const chunk = {
        chunk: {
          bytes: Buffer.from(
            JSON.stringify({
              completion: mockChunks[index],
              stop_reason: null,
            })
          ).toString('base64'),
        },
      };
      res.write(JSON.stringify(chunk) + '\n');
      index++;
    } else {
      clearInterval(interval);
      res.end();
    }
  }, 100);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Bedrock Mock Server running on port ${PORT}`);
});
```

### モックサーバーの起動：

```bash
cd bedrock-mock
npm install
npm start
```

## 5. CDKを使ったLocalStackリソースのデプロイ

### 依存関係のインストール

```bash
npm ci
```

### LocalStack環境用のスクリプト

`package.json` にLocalStack用のスクリプトを追加済み：

```json
{
  "scripts": {
    "cdk:localstack:bootstrap": "source .env && cdklocal bootstrap",
    "cdk:localstack:deploy": "source .env && cdklocal deploy --all --require-approval never",
    "cdk:localstack:destroy": "source .env && cdklocal destroy --all --force",
    "cdk:localstack:diff": "source .env && cdklocal diff",
    "cdk:localstack:synth": "source .env && cdklocal synth"
  }
}
```

### LocalStack環境でのCDKブートストラップ

```bash
# LocalStack起動確認
curl http://localhost:4566/_localstack/health

# CDKブートストラップ（初回のみ）
npm run cdk:localstack:bootstrap
```

### リソースのデプロイ

```bash
# LocalStackにリソースをデプロイ
npm run cdk:localstack:deploy

# または、手動で実行
source .env && cdklocal deploy --all
```

## 5. Lambda関数のデバッグとホットリロード

### Lambda関数のローカル開発用設定

LocalStackでLambda関数をデバッグ・ホットリロードするため、以下の設定を行います：

#### TypeScriptのビルド設定

`packages/cdk/tsconfig.json` を以下のように修正：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": ["./node_modules/@types"],
    "outDir": "./dist",
    "rootDir": "./",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "exclude": ["cdk.out", "dist", "node_modules"]
}
```

#### Lambda関数のローカルビルドスクリプト

`packages/cdk/package.json` にビルドスクリプトを追加：

```json
{
  "scripts": {
    "lambda:build": "tsc && cp -r lambda dist/",
    "lambda:watch": "tsc -w",
    "lambda:build:localstack": "npm run lambda:build && npm run lambda:sync",
    "lambda:sync": "rsync -av --delete dist/lambda/ ../localstack-lambda-sync/"
  }
}
```

### ホットリロードの実現

#### 1. Lambda関数の同期スクリプト作成

プロジェクトルートに `scripts/sync-lambda.sh` を作成：

```bash
#!/bin/bash

# Lambda関数のビルドと同期スクリプト
LAMBDA_SOURCE_DIR="./packages/cdk/lambda"
LAMBDA_BUILD_DIR="./packages/cdk/dist/lambda"
LOCALSTACK_LAMBDA_DIR="./localstack-lambda-sync"

# TypeScriptのビルド
echo "Building Lambda functions..."
cd packages/cdk
npm run build
cd ../..

# ビルド結果を同期ディレクトリにコピー
echo "Syncing Lambda functions to LocalStack..."
mkdir -p $LOCALSTACK_LAMBDA_DIR
rsync -av --delete $LAMBDA_BUILD_DIR/ $LOCALSTACK_LAMBDA_DIR/

echo "Lambda functions synced successfully!"
```

#### 2. Lambda関数の自動デプロイ

`scripts/deploy-lambda.sh` を作成：

```bash
#!/bin/bash

# Lambda関数の個別更新スクリプト
FUNCTION_NAME=$1

if [ -z "$FUNCTION_NAME" ]; then
  echo "Usage: $0 <function-name>"
  exit 1
fi

echo "Updating Lambda function: $FUNCTION_NAME"

# 関数コードの更新
aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://./localstack-lambda-sync/${FUNCTION_NAME}.zip \
  --endpoint-url http://localhost:4566

echo "Lambda function $FUNCTION_NAME updated successfully!"
```

### 開発ワークフロー

#### 1. 開発用の環境起動

```bash
# LocalStack起動
docker-compose up -d

# Lambda関数のビルド監視（別ターミナル）
cd packages/cdk
npm run lambda:watch

# Lambda同期の自動化（別ターミナル）
watch -n 2 ./scripts/sync-lambda.sh
```

#### 2. リアルタイム開発

1. Lambda関数のコードを編集
2. TypeScriptの自動ビルドが実行される
3. 同期スクリプトがLocalStackに変更を反映
4. LocalStackで即座にテスト可能

## 5. フロントエンドの起動

### LocalStack用環境変数の設定

```bash
# LocalStack用環境変数を読み込み
source .env

# デプロイされたリソースの情報を取得
export VITE_APP_API_ENDPOINT=$(aws apigateway get-rest-apis --endpoint-url http://localhost:4566 --query 'items[0].id' --output text)
export VITE_APP_USER_POOL_ID=$(aws cognito-idp list-user-pools --max-items 10 --endpoint-url http://localhost:4566 --query 'UserPools[0].Id' --output text)
```

### 開発サーバーの起動

```bash
npm run web:dev
```

## 6. 動作確認とデバッグ

### LocalStackリソースの確認

```bash
# LocalStackの健康状態チェック
curl http://localhost:4566/_localstack/health

# デプロイされたリソースの確認
cdklocal list --app 'npx ts-node --prefer-ts-exts packages/cdk/bin/generative-ai-use-cases.ts'

# Lambda関数一覧
aws lambda list-functions --endpoint-url http://localhost:4566 --query 'Functions[].FunctionName'

# DynamoDBテーブル一覧
aws dynamodb list-tables --endpoint-url http://localhost:4566

# API Gateway一覧
aws apigateway get-rest-apis --endpoint-url http://localhost:4566
```

### Lambda関数のテスト

```bash
# 個別Lambda関数のテスト
aws lambda invoke \
  --function-name <function-name> \
  --endpoint-url http://localhost:4566 \
  --payload '{"test": "data"}' \
  response.json

# レスポンス確認
cat response.json
```

### LocalStackログの確認

```bash
# LocalStackコンテナのログを確認
docker logs localstack-genu -f

# 特定のサービスのログをフィルタ
docker logs localstack-genu 2>&1 | grep -i lambda
docker logs localstack-genu 2>&1 | grep -i api
```

### デバッグ用の便利コマンド

```bash
# LocalStack内部の状態確認
curl http://localhost:4566/_localstack/init

# Lambda関数の環境変数確認
aws lambda get-function-configuration \
  --function-name <function-name> \
  --endpoint-url http://localhost:4566

# DynamoDBテーブルの内容確認
aws dynamodb scan \
  --table-name <table-name> \
  --endpoint-url http://localhost:4566
```

### アプリケーション動作確認

1. ブラウザで `http://localhost:5173` にアクセス
2. ユーザー登録・ログインを実行
3. 基本機能のテスト：
   - Chat - 基本的な対話機能
   - Text Generation - 文章生成
   - Summarization - 文書要約
   - Translation - 翻訳機能
   - Writing - 文章校正・改善

## 7. トラブルシューティング

### よくある問題と解決法

#### 1. LocalStackが起動しない

```bash
# Dockerの状態確認
docker ps -a | grep localstack

# ポート4566が使用中かチェック
lsof -i :4566

# LocalStackコンテナの再起動
docker-compose down && docker-compose up -d
```

#### 2. CDKデプロイが失敗する

```bash
# cdklocalの設定確認
which cdklocal
cdklocal --version

# LocalStack接続テスト
curl http://localhost:4566/_localstack/health

# デバッグモードでデプロイ
DEBUG=1 cdklocal deploy --verbose
```

#### 3. Lambda関数のデプロイエラー

```bash
# TypeScriptビルドエラーの確認
cd packages/cdk
npm run build

# Lambda関数のサイズ確認
du -sh dist/lambda/*

# Lambda実行ロール確認
aws iam list-roles --endpoint-url http://localhost:4566
```

#### 4. Lambda関数の実行エラー

```bash
# Lambda関数のログ確認
aws logs describe-log-groups --endpoint-url http://localhost:4566
aws logs filter-log-events \
  --log-group-name /aws/lambda/<function-name> \
  --endpoint-url http://localhost:4566

# Lambda関数の手動テスト
aws lambda invoke \
  --function-name <function-name> \
  --endpoint-url http://localhost:4566 \
  --log-type Tail \
  --payload '{}' \
  output.json
```

#### 5. フロントエンドでAPI接続エラー

```bash
# API Gatewayエンドポイントの確認
aws apigateway get-rest-apis --endpoint-url http://localhost:4566

# CORS設定の確認
curl -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS \
  http://localhost:4566/restapis/<api-id>/local/_user_request_
```

#### 5. Cognito認証エラー

```bash
# ユーザープール確認
aws cognito-idp list-user-pools --max-items 10 --endpoint-url http://localhost:4566

# テストユーザー作成
aws cognito-idp admin-create-user \
  --user-pool-id <user-pool-id> \
  --username testuser \
  --endpoint-url http://localhost:4566
```

### パフォーマンス最適化

#### Lambda関数のコールドスタート短縮

```yaml
# docker-compose.ymlに追加設定
environment:
  - LAMBDA_KEEPALIVE_MS=600000 # 10分間コンテナ保持
  - LAMBDA_EXECUTOR=docker-reuse
```

#### DynamoDBのレスポンス改善

```bash
# LocalStackのDynamoDB最適化
docker exec localstack-genu \
  curl -X POST http://localhost:4566/_localstack/config \
  -d '{"dynamodb_optimize_db": true}'
```

## 8. 開発ワークフロー

### 日常的な開発フロー

1. **環境起動**

```bash
# LocalStack起動
docker-compose up -d

# 環境変数読み込み
source .env.localstack
```

2. **Lambda関数開発**

```bash
# 開発用ビルド監視起動（ターミナル1）
cd packages/cdk
npm run lambda:watch

# ホットリロード監視（ターミナル2）
watch -n 2 ./scripts/sync-lambda.sh
```

3. **フロントエンド開発**

```bash
# フロントエンド開発サーバー起動（ターミナル3）
npm run web:dev
```

4. **テストとデバッグ**

```bash
# Lambda関数の個別テスト
aws lambda invoke --function-name predict --endpoint-url http://localhost:4566 --payload file://test.json output.json

# ログ確認
docker logs localstack-genu | grep -i error
```

### 効率的なデバッグ手法

#### 1. Lambda関数内でのconsole.log

```typescript
// Lambda関数内
export const handler = async (event: any) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  // LocalStackのログに出力される
};
```

#### 2. LocalStackログの監視

```bash
# 複数ターミナルでログ監視
docker logs localstack-genu -f | grep "your-function-name"
```

## 9. リセット・クリーンアップ

### 部分リセット

```bash
# 特定のスタック削除
cdklocal destroy GenerativeAiUseCasesStack --force

# Lambda関数のみリセット
aws lambda list-functions --endpoint-url http://localhost:4566 \
  --query 'Functions[].FunctionName' --output text | \
  xargs -I {} aws lambda delete-function --function-name {} --endpoint-url http://localhost:4566
```

### 完全リセット

```bash
# LocalStack停止とデータ削除
docker-compose down -v
rm -rf ./localstack-data

# 依存関係のクリーンアップ
rm -rf node_modules packages/*/node_modules
npm ci

# LocalStack再起動
docker-compose up -d
```

### 環境の完全初期化

```bash
#!/bin/bash
# reset-localstack.sh

echo "Resetting LocalStack environment..."

# 停止・削除
docker-compose down --volumes --remove-orphans
docker system prune -f

# データ削除
rm -rf ./localstack-data
rm -rf ./localstack-lambda-sync
rm -rf packages/cdk/dist
rm -rf packages/cdk/cdk.out

# 再構築
docker-compose up -d
source .env.localstack
npm run cdk:localstack:bootstrap
npm run cdk:localstack:deploy

echo "LocalStack environment reset complete!"
```

## 10. 開発時のベストプラクティス

### 1. 設定管理

- 環境変数は`.env`ファイルで管理
- 機密情報は環境変数で管理、リポジトリにコミットしない

### 2. Lambda開発

- TypeScriptの型安全性を活用
- ユニットテストを並行して実装
- ログレベルを環境に応じて調整

### 3. デバッグ効率化

- 複数ターミナルを活用したログ監視
- LocalStackのダッシュボード活用（Pro版）
- AWS CLIコマンドをスクリプト化

### 4. パフォーマンス

- Lambda関数のコールドスタート対策
- DynamoDBのクエリ最適化
- 不要なリソースの定期削除

## 11. 本番環境への移行

### 1. 設定の切り替え

```bash
# LocalStackから本番AWSへ
unset AWS_ENDPOINT_URL
export AWS_PROFILE=production

# 本番用cdk.json使用
npm run cdk:deploy
```

### 2. 環境差分の確認

```bash
# 設定差分のチェック
cdklocal diff --app 'npx ts-node packages/cdk/bin/generative-ai-use-cases.ts'
cdk diff --app 'npx ts-node packages/cdk/bin/generative-ai-use-cases.ts'
```

### 3. セキュリティ設定の見直し

- IAMロールの最小権限化
- VPCエンドポイントの設定
- WAF・CloudTrailの有効化
- 環境変数の暗号化（Systems Manager Parameter Store）

## まとめ

このガイドにより、以下が実現できます：

✅ **完全ローカル開発環境** - AWSアカウント不要でのフルスタック開発  
✅ **リアルタイムデバッグ** - Lambda関数のホットリロードとログ監視  
✅ **コスト削減** - 開発段階でのAWS料金発生なし  
✅ **高速イテレーション** - 即座にテスト・デバッグ可能  
✅ **本番同等環境** - CDKによる本番環境と同一のインフラ構成

LocalStack + CDKを活用することで、効率的でコスト効率の良いサーバーレス開発が可能になります。
