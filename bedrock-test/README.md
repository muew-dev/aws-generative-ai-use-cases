# Bedrock Connection Test

シンプルなAWS Bedrock接続テスト用プロジェクト

## 実行方法

### 前提条件

- AWS SSO設定済み
- Dockerとdocker-compose導入済み

### 1. AWS SSOログイン

```bash
aws sso login --profile AdministratorAccess-033566443293
```

### 2. テスト実行

```bash
# SSOプロファイルを指定してDocker Compose実行
AWS_PROFILE=AdministratorAccess-033566443293 docker-compose up

# または環境変数設定してから実行
export AWS_PROFILE=AdministratorAccess-033566443293
docker-compose up
```

## テスト内容

1. **AWS認証情報確認**: STS get-caller-identityでアイデンティティ確認
2. **Bedrockモデル一覧**: 利用可能なモデル一覧取得
3. **Claude呼び出し**: Claude 3.5 Sonnetでテキスト生成
4. **Claudeストリーミング**: リアルタイムストリーミング応答

## トラブルシューティング

### 認証エラーの場合

```bash
# SSOトークン確認
aws sts get-caller-identity --profile AdministratorAccess-033566443293

# 必要に応じて再ログイン
aws sso login --profile AdministratorAccess-033566443293
```
