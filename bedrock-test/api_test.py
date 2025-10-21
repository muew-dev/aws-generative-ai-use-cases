#!/usr/bin/env python3
"""
RAG API エンドポイントの統合テスト

FastAPIサーバーを起動してエンドポイントをテスト
"""

import asyncio
import json
import httpx


async def test_health_endpoint():
    """ヘルスチェックエンドポイント"""
    print("=== Health Check Endpoint ===")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("http://localhost:8000/api/health")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            return response.status_code == 200
        except Exception as e:
            print(f"❌ Health endpoint error: {e}")
            return False


async def test_rag_retrieve_endpoint():
    """文書検索エンドポイント"""
    print("\n=== RAG Retrieve Endpoint ===")
    
    params = {
        "query": "What is AWS Lambda?",
        "knowledgeBaseId": "dummy-kb-id-12345",  # ダミーID
        "maxResults": 3,
        "confidenceThreshold": 0.7
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "http://localhost:8000/api/rag/retrieve",
                params=params,
                timeout=30.0
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
        except Exception as e:
            print(f"❌ Retrieve endpoint error: {e}")


async def test_rag_stream_endpoint():
    """ストリーミングRAGエンドポイント"""
    print("\n=== RAG Stream Endpoint ===")
    
    request_body = {
        "query": "Explain AWS Lambda functions",
        "knowledge_base_id": "dummy-kb-id-12345",  # ダミーID
        "model": {
            "temperature": 0.1,
            "maxTokens": 100
        },
        "system_prompt": "You are a helpful AWS expert."
    }
    
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream(
                "POST",
                "http://localhost:8000/api/rag/chat-stream",
                json=request_body,
                headers={"Content-Type": "application/json"},
                timeout=60.0
            ) as response:
                print(f"Status: {response.status_code}")
                print(f"Headers: {dict(response.headers)}")
                
                chunk_count = 0
                async for chunk in response.aiter_lines():
                    if chunk.startswith("data: "):
                        chunk_count += 1
                        data_str = chunk[6:]  # "data: " を除去
                        try:
                            data = json.loads(data_str)
                            print(f"  Chunk {chunk_count}: {data.get('type', 'unknown')}")
                            if data.get('type') == 'error':
                                print(f"    Error: {data.get('error', 'Unknown error')}")
                            elif data.get('type') == 'token':
                                print(f"    Token: {data.get('token', '')[:50]}")
                        except json.JSONDecodeError:
                            print(f"  Raw chunk: {data_str[:100]}")
                        
                        if chunk_count >= 10:  # 最初の10チャンクまで
                            break
                            
        except Exception as e:
            print(f"❌ Stream endpoint error: {e}")


async def main():
    """メインテスト実行"""
    print("RAG API Integration Test")
    print("=" * 40)
    print("Prerequisites:")
    print("1. Start FastAPI server: cd packages/backend && task dev")
    print("2. Make sure AWS credentials are configured")
    print("")
    
    # ヘルスチェック
    health_ok = await test_health_endpoint()
    
    if health_ok:
        print("✅ FastAPI server is running")
        
        # RAGエンドポイントテスト
        await test_rag_retrieve_endpoint()
        await test_rag_stream_endpoint()
    else:
        print("❌ FastAPI server not accessible")
        print("Please start the server with: cd packages/backend && task dev")
    
    print("\n=== Test Summary ===")
    print("Expected results:")
    print("✅ Health endpoint should return 200 OK")
    print("❌ RAG endpoints should return errors (no Knowledge Base)")
    print("🔧 After Knowledge Base creation, RAG endpoints should work")


if __name__ == "__main__":
    asyncio.run(main())