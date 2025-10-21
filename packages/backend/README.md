# FastAPI バックエンド API エンドポイント

AWS Generative AI Use Cases プロジェクトのバックエンドAPI仕様書です。リファクタリング作業の参考資料として作成されています。

## 概要

- **フレームワーク**: FastAPI + Python 3.13
- **認証**: AWS ALB Cognito OIDC統合（ヘッダーベース認証）
- **データベース**: PostgreSQL (Aurora Serverless v2) + Prisma
- **AI/ML**: Amazon Bedrock (Claude 3.5 Sonnet)

## 認証

### 認証フロー

1. **Cognito Hosted UI**でのユーザーログイン
2. **ALB (Application Load Balancer)**がCognito OIDC統合により認証を処理
3. ALBが認証情報をHTTPヘッダーとしてバックエンドに転送

### 認証ヘッダー

すべてのAPIエンドポイント（ヘルスチェック除く）は認証が必要です：

- `x-amzn-oidc-accesstoken`: Cognitoから発行されたJWTアクセストークン
- `x-amzn-oidc-identity`: CognitoユーザーID（sub claim）

## エンドポイント一覧

### 1. チャット管理 (Chats)

#### POST /api/chats

**説明**: 新しいチャットを作成  
**メソッド**: POST  
**認証**: 必須

**リクエストボディ**:

```json
{
  "title": "string | null" // 最大500文字、オプショナル
}
```

**レスポンス**:

- **201 Created**: チャット作成成功

```json
{
  "id": "string",
  "title": "string | null",
  "userId": "string",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

- **401 Unauthorized**: 認証エラー
- **422 Unprocessable Entity**: バリデーションエラー
- **500 Internal Server Error**: サーバー内部エラー

---

#### GET /api/chats

**説明**: ユーザーのチャット一覧を取得（ページネーション対応）  
**メソッド**: GET  
**認証**: 必須

**クエリパラメータ**:

- `offset`: `int | null` - オフセット（デフォルト: null）
- `limit`: `int | null` - 取得件数制限（デフォルト: null）

**レスポンス**:

- **200 OK**: チャット一覧取得成功

```json
{
  "chats": [
    {
      "id": "string",
      "title": "string | null",
      "userId": "string",
      "createdAt": "datetime",
      "updatedAt": "datetime"
    }
  ],
  "total": "int",
  "offset": "int",
  "limit": "int"
}
```

- **401 Unauthorized**: 認証エラー
- **422 Unprocessable Entity**: バリデーションエラー
- **500 Internal Server Error**: サーバー内部エラー

### 2. メッセージ管理 (Messages)

#### POST /api/chats/{chat_id}/messages

**説明**: 指定されたチャットに新しいメッセージを作成  
**メソッド**: POST  
**認証**: 必須

**パスパラメータ**:

- `chat_id`: `string` - チャットID

**リクエストボディ**:

```json
{
  "role": "user | assistant", // 必須、user または assistant
  "content": [
    // 必須、最低1つの要素
    {
      "contentType": "string", // 必須、コンテンツタイプ
      "body": "string", // 必須、コンテンツ本文
      "mediaType": "string | null" // オプショナル、メディアタイプ
    }
  ],
  "systemPrompt": "string | null", // 最大2000文字、オプショナル
  "model": {
    // オプショナル、モデル設定
    "modelId": "string | null",
    "temperature": "float", // 0.0-1.0
    "maxTokens": "int", // 1-8192
    "topP": "float", // 0.0-1.0
    "stopSequences": ["string"] // 最大4つの停止シーケンス
  }
}
```

**レスポンス**:

- **201 Created**: メッセージ作成成功

```json
{
  "id": "string",
  "chatId": "string",
  "role": "string",
  "content": [
    {
      "contentType": "string",
      "body": "string",
      "mediaType": "string | null"
    }
  ],
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

- **401 Unauthorized**: 認証エラー
- **404 Not Found**: チャットが見つからない
- **422 Unprocessable Entity**: バリデーションエラー
- **500 Internal Server Error**: サーバー内部エラー

### 3. ストリーミング (Streaming)

#### POST /api/predict-stream

**説明**: AI応答をSSE（Server-Sent Events）でストリーミング配信  
**メソッド**: POST  
**認証**: 必須

**リクエストボディ**:

```json
{
  "messages": [
    // 必須、最低1つのメッセージ
    {
      "role": "user | assistant | system",
      "content": "string" // 最低1文字必須
    }
  ],
  "systemPrompt": "string | null", // 最大2000文字
  "model": {
    // オプショナル
    "modelId": "string | null",
    "temperature": "float", // 0.0-1.0
    "maxTokens": "int", // 1-8192
    "topP": "float", // 0.0-1.0
    "stopSequences": ["string"]
  },
  "saveToHistory": "bool", // デフォルト: false
  "chatId": "string | null" // 関連するチャットID
}
```

**レスポンス**:

- **200 OK**: ストリーミング開始
  - Content-Type: `text/event-stream`
  - SSEフォーマットでAI応答をリアルタイム配信
- **401 Unauthorized**: 認証エラー
- **422 Unprocessable Entity**: バリデーションエラー
- **502 Bad Gateway**: 外部サービス（Bedrock）エラー
- **500 Internal Server Error**: サーバー内部エラー

---

#### GET /api/predict-stream

**説明**: クエリパラメータを使用したAI応答ストリーミング  
**メソッド**: GET  
**認証**: 必須

**クエリパラメータ**:

- `messages`: `string` - JSON形式のメッセージ配列（必須）
- `systemPrompt`: `string | null` - システムプロンプト
- `model`: `string | null` - JSON形式のモデル設定
- `saveToHistory`: `bool` - 履歴保存フラグ（デフォルト: false）
- `chatId`: `string | null` - チャットID

**レスポンス**: POST版と同様

### 4. RAG (検索拡張生成)

#### GET /api/rag/retrieve

**説明**: ナレッジベースから関連文書を検索・取得  
**メソッド**: GET  
**認証**: 必須

**クエリパラメータ**:

- `query`: `string` - 検索クエリ（1-1000文字、必須）
- `knowledgeBaseId`: `string` - ナレッジベースID（必須）
- `maxResults`: `int` - 最大取得件数（1-20、デフォルト: 5）
- `confidenceThreshold`: `float` - 信頼度閾値（0.0-1.0、デフォルト: 0.7）

**レスポンス**:

- **200 OK**: 文書検索成功

```json
{
  "retrievalResults": [
    {
      "content": {
        "text": "string"
      },
      "location": {
        "type": "S3",
        "s3Location": {
          "uri": "string"
        }
      },
      "score": "float",
      "metadata": {}
    }
  ]
}
```

- **401 Unauthorized**: 認証エラー
- **422 Unprocessable Entity**: バリデーションエラー
- **500 Internal Server Error**: サーバー内部エラー（外部サービス呼び出し含む）

---

#### POST /api/rag/chat-stream

**説明**: RAGを使用したチャット応答のストリーミング配信  
**メソッド**: POST  
**認証**: 必須

**リクエストボディ**:

```json
{
  "query": "string", // 1-1000文字、必須
  "knowledge_base_id": "string", // 必須
  "model": {
    // オプショナル
    "modelId": "string | null",
    "temperature": "float", // 0.0-1.0
    "maxTokens": "int", // 1-8192
    "topP": "float", // 0.0-1.0
    "stopSequences": ["string"]
  },
  "system_prompt": "string | null" // 最大2000文字
}
```

**レスポンス**:

- **200 OK**: RAGストリーミング開始
  - Content-Type: `text/event-stream`
  - ナレッジベースから取得したコンテキストを使用したAI応答
- **401 Unauthorized**: 認証エラー
- **422 Unprocessable Entity**: バリデーションエラー
- **500 Internal Server Error**: サーバー内部エラー（外部サービス呼び出し含む）

### 5. ヘルスチェック (Health)

#### GET /api/health

**説明**: 基本的なヘルスチェック  
**メソッド**: GET  
**認証**: 不要

**レスポンス**:

- **200 OK**: サービス正常

```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

#### GET /api/health/detailed

**説明**: 詳細ヘルスチェック（データベース接続テスト含む）  
**メソッド**: GET  
**認証**: 不要

**レスポンス**:

- **200 OK**: 全サービス正常

```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "database": "connected"
  }
}
```

- **200 OK**: 一部サービスに問題

```json
{
  "status": "degraded",
  "version": "1.0.0",
  "services": {
    "database": "error: [エラーメッセージ前50文字]"
  }
}
```

## エラーレスポンス形式

### 標準エラーレスポンス

```json
{
  "error": {
    "type": "string",
    "message": "string",
    "details": {}
  }
}
```

### バリデーションエラーレスポンス (422)

```json
{
  "error": {
    "type": "validation_error",
    "message": "string",
    "details": {
      "field_errors": [
        {
          "field": "string",
          "message": "string",
          "value": "any"
        }
      ]
    }
  }
}
```

## 技術的な注意点

### 認証ミドルウェア

- **Cognito Hosted UI** → **ALB OIDC統合** → **バックエンド**の認証フロー
- ALBがCognito認証後にHTTPヘッダーとして認証情報を転送
- `x-amzn-oidc-accesstoken`と`x-amzn-oidc-identity`ヘッダーを検証
- 未認証の場合は401を返す
- ALBレベルで認証が完了しているため、バックエンドでの追加認証処理は不要

### ストリーミング応答

- Server-Sent Events (SSE) 形式
- `text/event-stream` Content-Type
- リアルタイムでAI応答を配信

### 外部サービス統合

- Amazon Bedrock（AI生成）
- Amazon Bedrock Knowledge Base（RAG）
- 外部サービスエラー時は502または500を返す

### データベース

- Prisma ORMを使用したPostgreSQL接続
- 非同期操作によるパフォーマンス最適化

### セキュリティ機能

- XSS攻撃対策のためのテキストサニタイズ
- CORS設定による適切なオリジン制御
- 入力値バリデーションによるセキュリティ向上

## アーキテクチャ設計

### 設計思想

このバックエンドは**Clean Architecture（クリーンアーキテクチャ）**の原則に基づいて設計されており、以下の思想を重視しています：

- **ドメイン中心設計**: ビジネスロジックを技術的実装から完全に分離
- **テスタビリティ優先**: 単体テストと統合テストが容易な構造
- **型安全性の徹底**: MyPyとPydanticによる堅牢な型システム
- **依存関係の逆転**: 内側の層が外側の層に依存しない構造

### アーキテクチャ構成

#### レイヤー構造

```
┌─────────────────────────────────────────┐
│ Infrastructure (Web/Database/External)  │ ← 技術的実装詳細
├─────────────────────────────────────────┤
│ Interfaces (Controllers)                │ ← 外部インターフェース
├─────────────────────────────────────────┤
│ UseCases (Application Services)         │ ← アプリケーションロジック
├─────────────────────────────────────────┤
│ Domain (Entities/Models/Repositories)   │ ← ビジネスロジック
└─────────────────────────────────────────┘
```

#### フォルダ構造

```
src/
├── config/                    # アプリケーション設定
├── domain/                    # ドメイン層
│   ├── entities/             # ドメインエンティティ (Chat, Message, User)
│   ├── errors/               # ドメイン例外
│   ├── models/               # データモデル
│   └── repositories/         # リポジトリインターフェース
├── infrastructure/           # インフラストラクチャ層
│   ├── container/            # DI コンテナ
│   ├── database/             # データベース実装 (Prisma)
│   ├── external/             # 外部サービス統合 (Bedrock)
│   └── web/                  # Web層 (FastAPI)
├── interfaces/               # インターフェース層
│   └── controllers/          # コントローラー
├── usecases/                 # ユースケース層
│   ├── chat/                 # チャット関連ビジネスプロセス
│   ├── message/              # メッセージ関連ビジネスプロセス
│   └── rag/                  # RAG機能ビジネスプロセス
└── utils/                    # ユーティリティ
```

### 主要デザインパターン

#### 1. Dependency Injection (DI) Pattern

```python
# DIContainer による依存関係管理
class DIContainer:
    @cached_property
    def get_chat_repository(self) -> IChatRepository:
        return PrismaChatRepository(self.get_prisma_client)

    @cached_property
    def get_create_chat_usecase(self) -> CreateChatUseCase:
        return CreateChatUseCase(
            self.get_chat_repository,
            self.get_user_repository
        )
```

#### 2. Repository Pattern

```python
# インターフェース定義（ドメイン層）
class IChatRepository(ABC):
    @abstractmethod
    async def save(self, chat: Chat) -> None: pass

    @abstractmethod
    async def find_by_id(self, user_id: UserId, chat_id: ChatId) -> Chat | None: pass

# 実装（インフラストラクチャ層）
class PrismaChatRepository(IChatRepository):
    async def save(self, chat: Chat) -> None:
        # Prisma実装
```

#### 3. Value Object Pattern

```python
@dataclass(frozen=True)
class ChatId:
    value: str

    def __post_init__(self):
        if not self.value:
            raise ValueError("ChatId cannot be empty")

@dataclass
class Chat:
    id: ChatId
    user_id: UserId
    title: str | None

    @classmethod
    def create(cls, user_id: UserId, title: str | None = None) -> "Chat":
        return cls(
            id=ChatId(str(uuid4())),
            user_id=user_id,
            title=title,
            # ビジネスルールを適用
        )
```

### 依存関係の流れ

```
HTTP Request
    ↓
Controllers (FastAPI Routes)
    ↓
UseCases (Business Processes)
    ↓
Domain Entities (Business Rules)
    ↓
Repository Interfaces
    ↓
Repository Implementations (Prisma/Bedrock)
    ↓
External Systems (Database/AWS)
```

**重要な原則:**

- 内側の層は外側の層について知らない
- 依存関係は常に内向き（Dependency Inversion Principle）
- インターフェースを通した抽象化により疎結合を実現

### コンポーネント間の責務

#### Domain Layer（ドメイン層）

- **エンティティ**: Chat, Message, User などのビジネス概念
- **ビジネスルール**: エンティティ作成時のバリデーション
- **リポジトリインターフェース**: データアクセスの抽象化

#### UseCase Layer（ユースケース層）

- **アプリケーションサービス**: CreateChatUseCase, SendMessageUseCase
- **ビジネスプロセスの調整**: 複数リポジトリの協調
- **トランザクション境界**: データ整合性の管理

#### Interface Layer（インターフェース層）

- **コントローラー**: HTTPリクエスト/レスポンスの処理
- **認証・認可**: ALB認証ヘッダーの検証
- **入力バリデーション**: Pydanticモデルによる検証

#### Infrastructure Layer（インフラストラクチャ層）

- **データベース**: Prisma ORM による PostgreSQL アクセス
- **外部サービス**: AWS Bedrock API 統合
- **Web フレームワーク**: FastAPI 設定と起動

### テスト戦略

#### 単体テスト

- ドメインエンティティのビジネスルール検証
- ユースケースのロジック検証（モック使用）
- コントローラーのHTTPインターフェース検証

#### 統合テスト

- リポジトリ実装とデータベースの統合
- 外部サービス（Bedrock）との統合
- エンドツーエンドのAPIフロー検証

#### TDD（テスト駆動開発）

```python
@pytest.mark.asyncio
async def test_create_chat_with_valid_title_returns_chat(self):
    # Arrange: テストデータ準備
    user_id = UserId("test-user")
    title = "テストチャット"

    # Act: ユースケース実行
    result = await self.use_case.execute(user_id.value, title)

    # Assert: 期待値検証
    assert result.title == title
    assert result.user_id == user_id
```

### 設定管理

#### 環境別設定

```python
class Settings(BaseSettings):
    # 開発環境
    local_user: str | None = None

    # AWS設定
    aws_region: str = "ap-northeast-1"
    bedrock_model_id: str = "anthropic.claude-3-5-sonnet..."

    # データベース設定
    database_url: str

    class Config:
        env_file = ".env"
```

この設計により、ビジネスロジックの変更、技術スタックの変更、外部サービスの変更に対して高い柔軟性と保守性を実現しています。
