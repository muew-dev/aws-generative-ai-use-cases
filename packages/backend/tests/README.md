# テスト戦略とガイドライン

## テスト駆動開発（TDD）アプローチ

このプロジェクトでは、テスト駆動開発（TDD）のプラクティスに従い、以下の順序で開発を進めます：

1. **期待される入出力に基づいてテストを作成**
2. **テストを実行し、失敗を確認**
3. **テストをパスさせる最小限の実装を追加**
4. **リファクタリングで品質向上**

## テストスイート構成

### 1. 単体テスト (Unit Tests)

- **対象**: ドメインエンティティ、ユースケース、リポジトリ実装
- **目的**: 各コンポーネントの独立した動作を検証
- **場所**: `tests/unit/`
- **依存関係**: モック化された外部依存

### 2. 統合テスト (Integration Tests)

- **対象**: APIエンドポイント、データベース連携、外部サービス連携
- **目的**: コンポーネント間の協調動作を検証
- **場所**: `tests/integration/`
- **依存関係**: テスト用データベース、モック化された外部API

### 3. エンドツーエンドテスト (E2E Tests)

- **対象**: 全体のワークフロー
- **目的**: ユーザーシナリオの検証
- **場所**: `tests/e2e/`
- **依存関係**: 実際のサービス環境

## RAG機能のテスト戦略

### 主要コンポーネント

1. **RAG Repository** - Bedrock Knowledge Base との統合
2. **RAG Use Cases** - ドキュメント検索とストリーミング生成
3. **RAG Controller** - APIエンドポイントの制御
4. **RAG Entities** - ドメインモデル

### テストレベル別アプローチ

#### 単体テスト

```python
# ドメインエンティティのテスト
def test_rag_query_validation():
    # 期待動作: 無効なクエリでエラー
    # 期待動作: 有効なクエリで正常作成

def test_retrieved_document_creation():
    # 期待動作: 必須フィールド検証
    # 期待動作: メタデータの適切な処理
```

#### 統合テスト

```python
# APIエンドポイントのテスト
def test_rag_retrieve_documents():
    # 期待動作: 正常なクエリで関連文書を返す
    # 期待動作: 閾値以下の文書は除外される

def test_rag_streaming_chat():
    # 期待動作: SSE形式でストリーミング応答
    # 期待動作: エラー時の適切な処理
```

## テスト実行コマンド

```bash
# 全テスト実行
python -m pytest

# 単体テストのみ
python -m pytest tests/unit/

# RAG関連テストのみ
python -m pytest tests/ -k "rag or RAG"

# カバレッジレポート付き
python -m pytest --cov=src --cov-report=html

# 詳細出力
python -m pytest -v -s
```

## モックとテストデータ

### モック戦略

1. **外部API**: Bedrock、S3 → レスポンスをモック化
2. **データベース**: Repository層をモック化
3. **認証**: ユーザー情報を固定値で提供

### テストデータファクトリー

```python
# FactoryBoyやdataclassesを使用
@dataclass
class TestDataFactory:
    @staticmethod
    def create_rag_query() -> RAGQuery:
        return RAGQuery(
            query="テスト用クエリ",
            knowledge_base_id="test-kb-id",
            max_results=5
        )
```

## CI/CD統合

### GitHub Actions

```yaml
- name: Run Tests
  run: |
    python -m pytest --cov=src --cov-fail-under=80

- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

## テスト品質の指標

### カバレッジ目標

- **単体テスト**: 90%以上
- **統合テスト**: 主要パス80%以上
- **全体**: 85%以上

### 重要な観点

1. **エラーハンドリング**: 異常系のテスト必須
2. **境界値テスト**: 最小/最大値の検証
3. **パフォーマンス**: レスポンス時間の監視
4. **セキュリティ**: 認証・認可の検証

## 現在の課題と改善点

### 既存テストの問題点

1. モック戦略が不十分（実装依存）
2. テストデータが手動作成
3. RAG機能のテストが不足
4. エラーケースのテストが少ない

### 改善計画

1. ✅ テスト戦略の文書化
2. 🔄 RAG単体テストの作成
3. 🔄 RAG統合テストの追加
4. 🔄 テストデータファクトリーの実装
5. 🔄 ドメインロジックの単体テスト充実
6. 🔄 モック戦略の改善

## ベストプラクティス

### テスト命名規則

```python
def test_[機能]_[条件]_[期待結果]():
    # 例: test_rag_search_with_empty_query_raises_validation_error
```

### AAA パターン (Arrange-Act-Assert)

```python
def test_example():
    # Arrange: テストデータの準備
    query = RAGQuery(query="test", knowledge_base_id="kb-1")

    # Act: テスト対象の実行
    result = rag_usecase.execute(query)

    # Assert: 結果の検証
    assert result.documents is not None
    assert len(result.documents) > 0
```

### テスト独立性

- 各テストは他のテストに依存しない
- テスト間での共有状態を避ける
- テストデータのクリーンアップを確実に実行
