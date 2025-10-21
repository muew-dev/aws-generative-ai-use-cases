# RAG機能 ローカルデバッグガイド

## 段階的デバッグ手順

### Phase 1: 基本接続確認

```bash
cd /Users/takeda/muew/aws-generative-ai-use-cases/bedrock-test
python rag_test.py
```

**期待結果:**

- ✅ Health check成功
- ❌ Knowledge Base関連エラー（正常）

### Phase 2: FastAPI統合確認

#### サーバー起動:

```bash
cd /Users/takeda/muew/aws-generative-ai-use-cases/packages/backend
task dev
```

#### 別ターミナルで統合テスト:

```bash
cd /Users/takeda/muew/aws-generative-ai-use-cases/bedrock-test
python api_test.py
```

**期待結果:**

- ✅ Health endpoint成功
- ❌ RAG endpoints エラー（Knowledge Base未作成のため正常）

### Phase 3: Knowledge Base作成後テスト

Knowledge Base作成後、以下のテストファイルを実際のKBIDで実行:

#### 実際のKnowledge Base IDでテスト

```python
# rag_test.py の knowledge_base_id を実際のIDに変更
knowledge_base_id = "ABCD1234-your-actual-kb-id"
```

### Phase 4: 個別コンポーネントデバッグ

#### DIコンテナ確認:

```bash
cd packages/backend
python -c "
from src.infrastructure.container.di_container import DIContainer
container = DIContainer('ap-northeast-1', 'claude-3-5-sonnet')
rag_repo = container.get_rag_repository
print('✅ RAG Repository injection OK')
"
```

#### 手動curl テスト:

```bash
# Health check
curl http://localhost:8000/api/health

# RAG retrieve (dummy KB ID)
curl "http://localhost:8000/api/rag/retrieve?query=test&knowledgeBaseId=dummy-123"

# RAG stream (dummy KB ID)
curl -X POST http://localhost:8000/api/rag/chat-stream \
  -H "Content-Type: application/json" \
  -d '{"query":"test","knowledge_base_id":"dummy-123"}'
```

## デバッグのポイント

### 1. ログレベル設定

FastAPI起動時にログレベルを詳細に:

```bash
LOG_LEVEL=DEBUG task dev
```

### 2. AWS認証確認

```bash
aws sts get-caller-identity
aws bedrock-agent list-knowledge-bases --region ap-northeast-1
```

### 3. 段階的エラー確認

1. **AWS接続**: `bedrock-test/main.py` で基本的なBedrock接続確認
2. **RAGRepository**: `bedrock-test/rag_test.py` でRAG実装確認
3. **FastAPI統合**: `bedrock-test/api_test.py` でAPI確認

### 4. Knowledge Base作成前 vs 後の期待値

#### 作成前（現在）:

- Health checks: ✅ 成功
- Knowledge Base operations: ❌ エラー（正常）

#### 作成後:

- 全ての操作: ✅ 成功

## トラブルシューティング

### よくあるエラー

1. **Import error**: `sys.path.append` でbackend/srcを追加
2. **AWS credentials**: SSO再認証 `aws sso login`
3. **FastAPI not running**: `task dev` でサーバー起動確認
4. **Knowledge Base not found**: 実際のKB IDに変更

### デバッグ用環境変数

```bash
export AWS_PROFILE=AdministratorAccess-033566443293
export LOG_LEVEL=DEBUG
export PYTHONPATH=/Users/takeda/muew/aws-generative-ai-use-cases/packages/backend/src
```
