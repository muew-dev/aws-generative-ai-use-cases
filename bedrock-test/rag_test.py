#!/usr/bin/env python3
"""
RAG機能の単体テスト

Knowledge Baseを作成する前に、RAGRepository実装の動作確認用
"""

import asyncio
import sys
from pathlib import Path

# backend/srcをパスに追加
backend_src = Path(__file__).parent.parent / "packages" / "backend" / "src"
sys.path.append(str(backend_src))

from infrastructure.external.bedrock_rag_repository import BedrockRAGRepository
from domain.entities.rag import RAGQuery


async def test_health_check():
    """ヘルスチェックテスト"""
    print("=== RAG Repository Health Check ===")
    
    repository = BedrockRAGRepository("ap-northeast-1")
    
    try:
        is_healthy = await repository.health_check()
        print(f"✅ Health check: {'OK' if is_healthy else 'Failed'}")
        return is_healthy
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False


async def test_retrieve_documents():
    """文書検索テスト（Knowledge Base未作成なのでエラー想定）"""
    print("\n=== Document Retrieval Test (Expected to fail) ===")
    
    repository = BedrockRAGRepository("ap-northeast-1")
    
    # ダミーのKnowledge Base IDでテスト
    query = RAGQuery(
        query="What is AWS?",
        knowledge_base_id="dummy-kb-id-12345",
        max_results=3,
        confidence_threshold=0.7
    )
    
    try:
        documents = await repository.retrieve_documents(query)
        print(f"✅ Retrieved {len(documents)} documents")
        for i, doc in enumerate(documents):
            print(f"  Document {i+1}: {doc.content[:100]}...")
    except Exception as e:
        print(f"❌ Expected error (no Knowledge Base): {e}")


async def test_streaming_rag():
    """ストリーミングRAGテスト（Knowledge Base未作成なのでエラー想定）"""
    print("\n=== Streaming RAG Test (Expected to fail) ===")
    
    repository = BedrockRAGRepository("ap-northeast-1")
    
    try:
        chunk_count = 0
        async for chunk in repository.retrieve_and_generate(
            query="Explain AWS Lambda",
            knowledge_base_id="dummy-kb-id-12345",
            model_config={
                "temperature": 0.1,
                "maxTokens": 100
            }
        ):
            chunk_count += 1
            print(f"  Chunk {chunk_count}: {chunk.type}")
            if chunk.type == "error":
                print(f"    Error: {chunk.error}")
                break
            elif chunk.type == "token" and chunk.token:
                print(f"    Token: {chunk.token[:50]}")
            elif chunk.type == "done":
                print("    ✅ Stream completed")
                break
                
    except Exception as e:
        print(f"❌ Expected error (no Knowledge Base): {e}")


async def main():
    """メインテスト実行"""
    print("RAG Repository Local Debug Test")
    print("=" * 40)
    
    # ヘルスチェック（これは成功するはず）
    health_ok = await test_health_check()
    
    if health_ok:
        # Knowledge Base関連テスト（エラー想定だが、実装確認）
        await test_retrieve_documents()
        await test_streaming_rag()
    else:
        print("❌ Health check failed, skipping other tests")
    
    print("\n=== Test Summary ===")
    print("✅ Health check should pass")
    print("❌ KB tests should fail (no Knowledge Base yet)")
    print("Next: Create S3 bucket and Knowledge Base")


if __name__ == "__main__":
    asyncio.run(main())