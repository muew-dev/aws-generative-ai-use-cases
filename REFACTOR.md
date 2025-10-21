# リファクタリングガイド

## コードベース理解のための順序

### **Step 1: フォルダ構成の把握**

```bash
packages/backend/src/
├── models/          # ドメインモデル
├── repositories/    # 抽象インターフェース
├── infrastructure/  # 具象実装
├── usecases/       # アプリケーション層UseCase
├── schemas/        # プレゼンテーション層API I/O
├── routers/        # プレゼンテーション層ルーティング
├── config/         # アプリケーション設定
└── utils/          # 共通ユーティリティ
```

### **Step 2: コードベース理解順序**

#### **2-1. ドメイン層から理解**

```bash
src/models/
├── domain_errors.py    # 1番目：ドメイン例外定義
├── user.py            # 2番目：ユーザードメインモデル
├── chat.py            # 3番目：チャットドメインモデル
├── message.py         # 4番目：メッセージドメインモデル（最重要）
├── rag.py            # 5番目：RAGドメインモデル
└── ai_models.py      # 6番目：AI設定モデル
```

#### **2-2. 抽象インターフェース**

```bash
src/repositories/
├── ai_repository.py        # AI操作抽象化
├── user_repository.py      # ユーザー抽象化
├── chat_repository.py      # チャット抽象化
├── message_repository.py   # メッセージ抽象化
└── rag_repository.py      # RAG抽象化
```

#### **2-3. 具象実装**

```bash
src/infrastructure/
├── bedrock_types.py           # Bedrock型定義
├── bedrock_config.py          # Bedrock設定
├── bedrock_models.py          # Bedrock型変換
├── bedrock_repository.py      # Bedrock AI実装
├── bedrock_rag_repository.py  # Bedrock RAG実装
├── prisma_client.py           # DB接続
├── prisma_user_repository.py  # ユーザーDB実装
├── prisma_chat_repository.py  # チャットDB実装
└── prisma_message_repository.py # メッセージDB実装
```

#### **2-4. アプリケーション層**

```bash
src/usecases/
├── create_chat_usecase.py      # チャット作成
├── list_chats_usecase.py       # チャット一覧
├── create_message_usecase.py   # メッセージ作成
├── stream_message_usecase.py   # ストリーミング（最重要）
├── rag_stream_usecase.py       # RAGストリーミング
└── retrieve_documents_usecase.py # ドキュメント検索
```

#### **2-5. プレゼンテーション層**

```bash
src/schemas/
├── requests/
│   ├── chat_requests.py       # チャットリクエスト
│   └── message_requests.py    # メッセージリクエスト
└── responses/
    └── message_responses.py   # 全レスポンス

src/routers/
├── chat_controller.py         # チャットAPI
├── message_controller.py      # メッセージAPI
└── rag_controller.py         # RAG API

src/config/
├── settings.py               # アプリ設定
├── routes.py                # ルート設定
├── middleware.py            # ミドルウェア
├── exception_handlers.py    # 例外ハンドラ
└── di_container.py         # DI設定
```

## リファクタリング進行順序

### **Phase 1: ドメイン層の理解**

1. `models/domain_errors.py` - 例外の種類理解
2. `models/user.py` - ID, ValueObject パターン
3. `models/chat.py` - エンティティパターン
4. `models/message.py` - 集約ルートとコンテンツ管理

### **Phase 2: 境界の理解**

5. `repositories/*.py` - 抽象インターフェース確認
6. `infrastructure/bedrock_*.py` - 外部サービス実装
7. `infrastructure/prisma_*.py` - DB実装確認

### **Phase 3: 応用層確認**

8. `usecases/create_*.py` - 単純なUseCaseから
9. `usecases/stream_*.py` - 複雑なUseCaseへ

### **Phase 4: API層**

10. `schemas/` - 入出力モデル確認
11. `routers/` - ルーティング実装確認
12. `config/` - アプリケーション設定確認

## 重要な設計パターン確認点

### **ドメイン層の確認**

- ValueObject vs Entity の区別
- 集約の境界の設計
- 不変条件の実装

### **UseCase層の確認**

- 外部依存の注入
- トランザクション管理
- エラーハンドリング

### **Infrastructure層の確認**

- 抽象化の実装
- 外部APIとの結合の緩和
- 設定の外部化

この順序で読み進めれば、**クリーンアーキテクチャの依存関係**を正しく理解できます。

## クリーンアーキテクチャ対応表

| レイヤー | 対応するフォルダ名 | 説明 |
|---------|------------------|------|
| **Entities** | `models`, `repositories` | `models` はドメインモデル（Entity）、`repositories` はそれに対する操作を定義するため、実質的にEntityに関係する |
| **Use Cases** | `usecases` | アプリケーションの振る舞いの中心。依存注入でRepositoryを呼ぶ |
| **Interface Adapters** | `schemas`, `routers` | `schemas` はDTO、`routers` はAPIのエンドポイント定義（Controllerに相当する） |
| **Frameworks & Drivers** | `infrastructure`, `config` | DB接続やSlack連携などの外部技術依存を実装。`config` もインフラ寄り |
