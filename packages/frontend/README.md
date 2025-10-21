# AWS Generative AI Use Cases - Frontend

Next.jsで構築されたフロントエンドアプリケーションです。PythonバックエンドのAPIと連携して動作します。

## 特徴

- **Next.js 15**: App Routerを使用したモダンなReactアプリケーション
- **Tailwind CSS**: ユーティリティファーストのCSSフレームワーク
- **AWS Cognito**: 認証システム（本番環境）
- **ストリーミング**: Server-Sent Eventsによるリアルタイム応答
- **TypeScript**: 型安全な開発体験

## セットアップ

### 1. 依存関係のインストール

```bash
cd packages/frontend
npm install
```

### 2. 環境変数の設定

`.env.local`ファイルを作成（または`.env.example`をコピー）：

```env
# 開発モード設定
NEXT_PUBLIC_API_ENDPOINT=http://localhost:8000
NEXT_PUBLIC_SKIP_AUTH=true
NEXT_PUBLIC_DEV_USER_ID=dev-user-123
NEXT_PUBLIC_DEV_USER_EMAIL=dev@example.com

# 本番用AWS設定（必要に応じて）
NEXT_PUBLIC_AWS_REGION=ap-northeast-1
NEXT_PUBLIC_USER_POOL_ID=your-user-pool-id
NEXT_PUBLIC_USER_POOL_CLIENT_ID=your-client-id
NEXT_PUBLIC_IDENTITY_POOL_ID=your-identity-pool-id
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

アプリケーションは `http://localhost:3000` で利用可能です。

## 使用方法

### 開発モード

- 認証をスキップしてすぐにチャット機能を使用可能
- バックエンドAPI (`http://localhost:8000`) が起動している必要があります

### 本番モード

- `NEXT_PUBLIC_SKIP_AUTH=false` に設定
- AWS Cognitoの設定が必要
- ALB経由でのデプロイを想定

## 主な機能

### チャット機能

- 新しいチャットの作成
- 既存チャットの一覧表示
- リアルタイムメッセージ交換
- ストリーミングレスポンス対応

### 認証

- 全てのエンドポイントでAWS Cognito認証が必須
- 開発モードでも Bearer 認証（dev-token）を使用

### UI/UX

- レスポンシブデザイン
- ダークモード対応（準備済み）
- アクセシビリティ配慮

## アーキテクチャ

```
app/
├── layout.tsx          # ルートレイアウト
├── page.tsx           # ランディングページ
├── auth/              # 認証ページ
└── chat/              # チャットページ

components/
├── auth/              # 認証関連コンポーネント
├── chat/              # チャット機能コンポーネント
└── ui/                # 共通UIコンポーネント

lib/
├── amplify.ts         # AWS Amplify設定
├── api-client.ts      # APIクライアント
└── types.ts           # TypeScript型定義

hooks/
└── useApi.ts          # API用カスタムフック
```

## 開発ガイド

### コードスタイル

- ESLintとPrettier設定済み
- TypeScript strict mode
- Tailwind CSSのユーティリティクラス使用

### テスト

```bash
npm run test      # テスト実行
npm run test:watch # ウォッチモード
```

### ビルド

```bash
npm run build     # 本番ビルド
npm run start     # 本番サーバー起動
```

## トラブルシューティング

### よくある問題

1. **APIサーバーとの接続エラー**
   - バックエンドサーバーが起動しているか確認
   - `NEXT_PUBLIC_API_ENDPOINT` の設定を確認

2. **認証エラー**
   - 開発モードでは `NEXT_PUBLIC_SKIP_AUTH=true` を設定（dev-tokenを使用）
   - 本番環境では適切なCognito設定が必須
   - 全てのエンドポイントでBearer認証が必要

3. **ストリーミングの問題**
   - CORS設定の確認
   - ネットワーク環境（プロキシ等）の確認
   - Bearer認証トークンの確認

### ログ確認

ブラウザの開発者ツールのコンソールでエラーログを確認してください。

## 今後の改善点

- [ ] メッセージ履歴の永続化
- [ ] ファイルアップロード機能
- [ ] チャット履歴の検索機能
- [ ] ダークモード完全対応
- [ ] PWA対応
- [ ] マルチ言語対応（i18n）
