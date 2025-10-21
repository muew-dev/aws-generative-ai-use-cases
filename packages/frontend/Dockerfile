# Next.js フロントエンド用の本番環境Dockerfile
# マルチステージビルドで最適化

# ==============================
# Stage 1: Dependencies
# ==============================
FROM node:22-alpine AS deps

# 必要なパッケージをインストール
RUN apk add --no-cache libc6-compat

WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 本番用依存関係のみをインストール
RUN npm ci --only=production && npm cache clean --force

# ==============================
# Stage 2: Builder
# ==============================
FROM node:22-alpine AS builder

WORKDIR /app

# 依存関係をコピー
COPY package*.json ./
RUN npm ci

# ソースコードをコピー
COPY . .

# Next.js アプリケーションをビルド
RUN npm run build

# ==============================
# Stage 3: Runner (本番実行環境)
# ==============================
FROM node:22-alpine AS runner

WORKDIR /app

# セキュリティ: 非rootユーザーを作成
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 本番用依存関係のみをコピー
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Next.js ビルド成果物をコピー
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/public ./public

# 非rootユーザーに切り替え
USER nextjs

# ポート3000を公開
EXPOSE 3000

# 環境変数
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Next.js 本番サーバーを起動
CMD ["npm", "start"]