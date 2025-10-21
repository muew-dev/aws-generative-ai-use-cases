# Bedrock ローカル開発設定ガイド

## 概要

このプロジェクトはAmazon Bedrockを使用してAI機能を提供します。ローカル開発ではAWS SSOを使用してBedrock接続を設定します。

## 前提条件：AWS Bedrock設定

ローカル開発を始める前に、AWS側でBedrockの設定が必要です。

### 1. Bedrockサービスの有効化

```bash
# AWS Management Console での手順
1. AWS Console にログイン
2. Amazon Bedrock サービスにアクセス
3. リージョンを ap-northeast-1 (東京) に設定
4. 「Get started」または「開始する」をクリック
```

### 2. Foundation Modelへのアクセス許可

```bash
# AWS Console での手順
1. Bedrock Console > Model access (モデルアクセス)
2. 「Request model access」または「モデルアクセスをリクエスト」をクリック
3. 必要なモデルを選択（推奨：Claude 3.5 Sonnet）
   - Anthropic Claude 3.5 Sonnet v2 ✓
   - Anthropic Claude 3.5 Haiku ✓ (オプション)
   - Amazon Titan Text G1 - Express ✓ (オプション)
4. 利用規約に同意して「Request access」をクリック
5. アクセス承認を待つ（通常数分〜数時間）
```

**重要**: モデルアクセスが「Available」になるまで待つ必要があります。

### 3. リージョン確認

```bash
# 使用可能リージョンの確認
# Claude 3.5 Sonnet が利用可能な主要リージョン：
- us-east-1 (バージニア北部)
- us-west-2 (オレゴン)
- ap-northeast-1 (東京) ← 推奨
- eu-central-1 (フランクフルト)
- eu-west-3 (パリ)
```

### 4. 料金とクォータの確認

```bash
# AWS Console での確認
1. Bedrock Console > Pricing (料金)
   - Claude 3.5 Sonnet: 入力 $3/1Mトークン, 出力 $15/1Mトークン
   - 無料利用枠はなし（従量課金）

2. Service Quotas (サービスクォータ)
   - デフォルト: Claude 3.5 Sonnet 4,000 RPM
   - 必要に応じてクォータ引き上げ申請
```

### 5. IAM設定（管理者権限がない場合）

管理者権限がない場合は、以下の権限をIAM管理者に依頼：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:ListFoundationModels",
        "bedrock:GetModelInvocationLoggingConfiguration",
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "*"
    }
  ]
}
```

### 6. 設定確認

```bash
# AWS CLI でモデルアクセス確認
aws bedrock list-foundation-models --region ap-northeast-1

# Claude 3.5 Sonnet のモデルIDを確認
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --by-provider anthropic \
  --query 'modelSummaries[?contains(modelId, `claude-3-5-sonnet`)]'

# 期待される出力例:
# [
#     {
#         "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
#         "modelName": "Claude 3.5 Sonnet",
#         "providerName": "Anthropic",
#         ...
#     }
# ]
```

## ローカル開発設定方法

### AWS SSO設定（推奨・必須）

```bash
# AWS CLIをインストール（未インストールの場合）
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# AWS SSO設定
aws configure sso
# SSO session name: your-company-sso
# SSO start URL: https://your-company.awsapps.com/start
# SSO region: ap-northeast-1
# SSO registration scopes: sso:account:access

# SSOログイン
aws sso login

# 設定確認
aws sts get-caller-identity
```

### プロファイル使用（複数アカウント・権限管理）

```bash
# 複数のSSOプロファイル管理
aws configure sso --profile bedrock-dev
aws configure sso --profile bedrock-prod

# 使用プロファイル指定
export AWS_PROFILE=bedrock-dev

# SSOログイン（プロファイル指定）
aws sso login --profile bedrock-dev

# docker-compose起動時にプロファイル指定
AWS_PROFILE=bedrock-dev docker-compose up
```

### 認証トークンの更新

AWS SSOトークンは有効期限があるため、定期的な更新が必要：

```bash
# SSOトークンの更新
aws sso login

# または特定のプロファイルで更新
aws sso login --profile bedrock-dev
```

## 必要なAWSパーミッション

Bedrockアクセスに必要な最小限の権限：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"
      ]
    }
  ]
}
```

## 開発環境起動

### 1. AWS SSOログイン

```bash
# SSOログイン（必須）
aws sso login

# または特定のプロファイルでログイン
aws sso login --profile bedrock-dev

# 認証確認
aws sts get-caller-identity
```

### 2. Docker Compose起動

```bash
# デフォルトプロファイルで起動
docker-compose up

# 特定のプロファイルで起動
AWS_PROFILE=bedrock-dev docker-compose up

# バックグラウンド起動
docker-compose up -d
```

### 3. 接続テスト

```bash
# ヘルスチェック確認
curl http://localhost:8000/api/health

# Bedrockストリーミングテスト
curl -X POST http://localhost:8000/api/predict-stream \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}], "saveToHistory": false}'

# レスポンス例:
# data: {"type": "token", "content": "Hello"}
# data: {"type": "token", "content": "!"}
# data: {"type": "done"}
```

## トラブルシューティング

### 認証エラー

```bash
# 現在の認証情報確認
aws sts get-caller-identity

# AWS SSO設定ファイル確認
cat ~/.aws/config

# SSOトークン状態確認
aws configure list
aws configure list --profile your-profile
```

### SSOトークンエラー

```bash
# トークン期限切れの場合
aws sso login

# 特定のプロファイルでトークン更新
aws sso login --profile bedrock-dev

# SSO設定の再設定
aws configure sso --profile bedrock-dev
```

### ログ確認

```bash
# Backendログ確認
docker-compose logs backend

# 特定のエラー検索
docker-compose logs backend | grep -i "bedrock\|error"
```

### よくある問題

1. **NoCredentialsError**: AWS SSO認証情報が設定されていない
   → `aws sso login` でトークン取得

2. **TokenRefreshError**: SSOトークンが期限切れ
   → `aws sso login --profile your-profile` で再認証

3. **AccessDeniedException**: Bedrockアクセス権限不足
   → IAMポリシー確認、SSO Permission Setsの確認

4. **UnauthorizedSSOTokenError**: SSOトークンが無効
   → `aws configure sso` で設定し直し、再ログイン

5. **ValidationException**: モデルIDが無効
   → BEDROCK_MODEL_ID環境変数確認

## 本番環境との違い

- **ローカル**: AWS SSO認証（~/.aws/sso/cache/）
- **本番**: IAMロールベース認証
- **設定**: docker-compose.yml vs CDK/CloudFormation
- **トークン**: 定期的なSSOトークン更新が必要 vs 自動更新

## SSOキャッシュ場所

AWS SSOトークンは以下の場所にキャッシュされます：

```bash
# SSOキャッシュディレクトリ
~/.aws/sso/cache/

# SSOトークン確認
ls -la ~/.aws/sso/cache/
```

Docker Composeは自動的にこのディレクトリもマウントするため、SSOトークンが利用可能です。

# RAG セットアップドキュメント

## Bedrockモデル有効化

AWSコンソールでBedrockモデルの有効化が必要です。

- Claude 3.5 Sonnet: `anthropic.claude-3-5-sonnet-20240620-v1:0`
- Titan Embed Text v2: `amazon.titan-embed-text-v2:0`

## データベースユーザー設定

Amazon Bedrock Knowledge Baseには専用のPostgreSQLユーザーと権限設定が必要です。

### bedrock_userの作成

```sql
CREATE ROLE bedrock_user WITH LOGIN PASSWORD 'your_secure_password';
```

### 権限の付与

```sql
GRANT USAGE ON SCHEMA bedrock_integration TO bedrock_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bedrock_integration.bedrock_kb TO bedrock_user;
```
