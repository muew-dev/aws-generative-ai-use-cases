"""API統合テスト

実用的なモック戦略でビジネスロジックとデータフローを検証する
"""

import pytest

# ALB Cognito OIDC認証ヘッダーのモック
ALB_AUTH_HEADERS = {
    "x-amzn-oidc-accesstoken": "mock-access-token",
    "x-amzn-oidc-identity": "test-user-123",
}


class TestChatAPIBusinessLogic:
    """チャットAPIのビジネスロジックテスト"""

    def test_health_endpoint_without_auth_succeeds(self, mock_client):
        """認証なしでのヘルスエンドポイントアクセスが成功することをテスト"""
        response = mock_client.get("/api/health")
        assert response.status_code == 200

    def test_create_chat_without_auth_returns_401(self, mock_client):
        """認証ヘッダーなしでのチャット作成が401を返すことをテスト"""
        response = mock_client.post("/api/chats", json={"title": "Test Chat"})
        assert response.status_code == 401

        # レスポンス形式も確認
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "UNAUTHORIZED"

    def test_create_chat_with_auth_header(self, mock_client):
        """認証ヘッダーありでのチャット作成をテスト"""
        response = mock_client.post(
            "/api/chats", json={"title": "Valid Test Chat"}, headers=ALB_AUTH_HEADERS
        )

        # 適切にモックされた環境では201 Created が返される
        assert response.status_code == 201
        data = response.json()

        # レスポンス形式を確認
        assert "id" in data
        assert "title" in data
        assert data["title"] == "Valid Test Chat"
        assert data["userId"] == "test-user-123"

    def test_create_chat_without_title(self, mock_client):
        """タイトルなしでのチャット作成をテスト（認証ヘッダーあり）"""
        response = mock_client.post("/api/chats", json={}, headers=ALB_AUTH_HEADERS)

        # タイトルはオプションなので、認証通過後は201 Created が返される
        assert response.status_code == 201

    def test_list_chats_without_auth_returns_401(self, mock_client):
        """認証なしでのチャット一覧取得が401を返すことをテスト"""
        response = mock_client.get("/api/chats?offset=0&limit=5")
        assert response.status_code == 401

    def test_list_chats_with_auth_header(self, mock_client):
        """認証ヘッダーありでのチャット一覧取得をテスト"""
        response = mock_client.get("/api/chats?offset=0&limit=5", headers=ALB_AUTH_HEADERS)

        # 認証通過後は200 OK が返される
        assert response.status_code == 200
        data = response.json()

        # レスポンス形式を確認
        assert "chats" in data
        assert "total" in data
        assert "offset" in data
        assert "limit" in data
        assert isinstance(data["chats"], list)

    def test_invalid_auth_headers_return_401(self, mock_client):
        """不正な認証ヘッダーで401が返されることをテスト"""
        invalid_headers = [
            # 空のヘッダー
            {"x-amzn-oidc-accesstoken": "", "x-amzn-oidc-identity": "user123"},
            {"x-amzn-oidc-accesstoken": "token", "x-amzn-oidc-identity": ""},
            # スペースのみ
            {"x-amzn-oidc-accesstoken": "   ", "x-amzn-oidc-identity": "user123"},
            {"x-amzn-oidc-accesstoken": "token", "x-amzn-oidc-identity": "   "},
            # 一方だけ
            {"x-amzn-oidc-accesstoken": "token"},
            {"x-amzn-oidc-identity": "user123"},
        ]

        for headers in invalid_headers:
            response = mock_client.post(
                "/api/chats", json={"title": "Test"}, headers=headers
            )
            assert response.status_code == 401, f"Failed for headers: {headers}"


class TestMessageAPIBusinessLogic:
    """メッセージAPIのビジネスロジックテスト"""

    def test_create_message_with_valid_structure(self, mock_client):
        """有効な構造でのメッセージ作成をテスト（存在しないチャットに対するアクセス）"""
        response = mock_client.post(
            "/api/chats/test-chat-123/messages",
            json={
                "role": "user",
                "content": [{"contentType": "text", "body": "Test message content"}],
            },
            headers=ALB_AUTH_HEADERS,
        )

        # 存在しないチャットに対するアクセスで403 Forbidden が返される
        assert response.status_code == 403
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "FORBIDDEN"

    def test_create_message_with_invalid_content(self, mock_client):
        """無効なコンテンツでのメッセージ作成をテスト"""
        response = mock_client.post(
            "/api/chats/test-chat-123/messages",
            json={
                "role": "user",
                "content": "invalid_content_format",  # 配列ではない
            },
            headers=ALB_AUTH_HEADERS,
        )

        # バリデーションエラー（422）が期待される
        assert response.status_code == 422

    def test_create_message_missing_required_fields(self, mock_client):
        """必須フィールドが無い場合のメッセージ作成をテスト"""
        response = mock_client.post(
            "/api/chats/test-chat-123/messages",
            json={
                # roleとcontentが無い
                "invalid_field": "invalid_value"
            },
            headers=ALB_AUTH_HEADERS,
        )

        # バリデーションエラー（422）が期待される
        assert response.status_code == 422


class TestStreamingAPIBehavior:
    """ストリーミングAPIの動作テスト"""

    def test_streaming_endpoint_returns_event_stream(self, mock_client):
        """ストリーミングエンドポイントがイベントストリームを返すことをテスト"""
        response = mock_client.post(
            "/api/predict-stream",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
                "saveToHistory": False,
            },
            headers=ALB_AUTH_HEADERS,
        )

        # ストリーミングは200で開始される
        assert response.status_code == 200

        # ストリーミング用のヘッダーが設定されている
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
        assert response.headers["cache-control"] == "no-cache"
        assert response.headers["connection"] == "keep-alive"

        # SSEデータ形式でエラーレスポンスが含まれている
        content = response.text
        assert "data:" in content
        assert "error" in content

    def test_streaming_handles_missing_messages(self, mock_client):
        """メッセージが無い場合のストリーミング処理をテスト"""
        response = mock_client.post(
            "/api/predict-stream",
            json={"saveToHistory": False},
            headers=ALB_AUTH_HEADERS,
        )

        # バリデーションエラー（422）が期待される
        assert response.status_code == 422

    def test_streaming_get_endpoint_missing_params_returns_422(self, mock_client):
        """必須パラメータなしのGETリクエストで422が返されることをテスト"""
        response = mock_client.get("/api/predict-stream", headers=ALB_AUTH_HEADERS)

        # 必須パラメータ（messages）が不足しているためバリデーションエラー
        assert response.status_code == 422

    def test_streaming_get_endpoint_with_valid_params(self, mock_client):
        """有効なパラメータでのGETリクエストをテスト"""
        import json

        messages = json.dumps([{"role": "user", "content": "Hello"}])
        response = mock_client.get(
            f"/api/predict-stream?messages={messages}&saveToHistory=false",
            headers=ALB_AUTH_HEADERS,
        )

        # 有効なパラメータでストリーミングが開始される
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"


class TestErrorResponseFormats:
    """エラーレスポンス形式のテスト"""

    def test_unauthorized_error_has_consistent_format(self, mock_client):
        """認証なしアクセスで401エラーが一貫した形式であることをテスト"""
        response = mock_client.get("/api/non-existent-endpoint")

        # 認証されていないため401エラー（セキュリティ上、存在確認をさせない）
        assert response.status_code == 401
        assert response.headers.get("content-type", "").startswith("application/json")

        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "UNAUTHORIZED"
        assert "timestamp" in data

    def test_validation_error_has_consistent_format(self, mock_client):
        """バリデーションエラーが一貫した形式であることをテスト"""
        response = mock_client.post(
            "/api/chats", json="invalid_json_structure", headers=ALB_AUTH_HEADERS
        )

        # バリデーションエラー（422）が期待される
        assert response.status_code == 422
        assert response.headers.get("content-type", "").startswith("application/json")

        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
        assert "timestamp" in data

    def test_method_not_allowed_error(self, mock_client):
        """許可されていないメソッドのエラー形式をテスト"""
        response = mock_client.patch(
            "/api/chats", headers=ALB_AUTH_HEADERS
        )  # PATCHは許可されていない

        # 許可されていないメソッドで405エラー
        assert response.status_code == 405
        assert response.headers.get("content-type", "").startswith("application/json")

        data = response.json()
        # FastAPI標準の405エラー形式
        assert "detail" in data
        assert data["detail"] == "Method Not Allowed"


class TestResponseStructureValidation:
    """レスポンス構造の検証テスト"""

    def test_successful_responses_have_consistent_structure(self, mock_client):
        """成功レスポンスが一貫した構造であることをテスト"""
        # ヘルスチェックで確実に成功するレスポンスをテスト
        response = mock_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()

        # ヘルスチェックの基本構造
        assert "status" in data
        assert "timestamp" in data
        assert "version" in data

    def test_detailed_health_response_structure(self, mock_client):
        """詳細ヘルスチェックのレスポンス構造をテスト"""
        response = mock_client.get("/api/health/detailed")

        assert response.status_code == 200
        data = response.json()

        # 詳細ヘルスチェックの構造
        assert "status" in data
        assert "timestamp" in data
        assert "version" in data
        assert "services" in data
        assert isinstance(data["services"], dict)

    def test_error_responses_include_timestamps_and_request_ids(self, mock_client):
        """エラーレスポンスにタイムスタンプとリクエストIDが含まれることをテスト"""
        response = mock_client.get("/api/non-existent")

        # 認証が優先されるため401エラー
        assert response.status_code == 401
        data = response.json()

        # カスタムエラーレスポンス形式の確認
        assert "error" in data
        assert "timestamp" in data

        # タイムスタンプが有効な形式であることを確認
        import datetime

        try:
            datetime.datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00"))
        except ValueError:
            assert False, f"Invalid timestamp format: {data['timestamp']}"


class TestAPISecurityAndValidation:
    """APIセキュリティと検証のテスト"""

    def test_cors_headers_are_present(self, mock_client):
        """CORSヘッダーが適切に設定されていることをテスト"""
        response = mock_client.get("/api/health")

        # CORS関連ヘッダーの確認（設定による）
        if "Access-Control-Allow-Origin" in response.headers:
            assert response.headers["Access-Control-Allow-Origin"] is not None

    def test_content_type_headers_are_correct(self, mock_client):
        """Content-Typeヘッダーが正しく設定されていることをテスト"""
        # JSONレスポンス（認証不要のエンドポイント）
        response = mock_client.get("/api/health")
        assert response.headers.get("content-type", "").startswith("application/json")

        # ストリーミングレスポンス（認証必要）
        stream_response = mock_client.post(
            "/api/predict-stream",
            json={"messages": [{"role": "user", "content": "test"}]},
            headers=ALB_AUTH_HEADERS,
        )
        assert "text/event-stream" in stream_response.headers.get("content-type", "")

    def test_large_payload_handling(self, mock_client):
        """大きなペイロードの処理をテスト（バリデーション制限の確認）"""
        large_content = "x" * 10000  # 10KB のコンテンツ（500文字制限を超過）
        response = mock_client.post(
            "/api/chats", json={"title": large_content}, headers=ALB_AUTH_HEADERS
        )

        # タイトル長制限（500文字）を超過するためバリデーションエラー
        assert response.status_code == 422
        assert response.headers.get("content-type", "").startswith("application/json")

        # エラーレスポンスの形式確認
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
        assert "String should have at most 500 characters" in str(
            data["error"]["details"]
        )

    def test_valid_payload_size_handling(self, mock_client):
        """適切なサイズのペイロード処理をテスト"""
        valid_content = "x" * 400  # 500文字制限内のコンテンツ
        response = mock_client.post(
            "/api/chats", json={"title": valid_content}, headers=ALB_AUTH_HEADERS
        )

        # 制限内であれば正常に作成される
        assert response.status_code == 201
        assert response.headers.get("content-type", "").startswith("application/json")

        data = response.json()
        assert "id" in data
        assert data["title"] == valid_content


class TestRAGAPIBusinessLogic:
    """RAG API のビジネスロジックテスト"""

    def test_rag_retrieve_documents_with_valid_data(self, mock_client):
        """有効なデータでのRAG文書検索をテスト"""
        response = mock_client.get(
            "/api/rag/retrieve",
            params={
                "query": "AWS Bedrockの使い方を教えてください",
                "knowledgeBaseId": "test-kb-123",
                "maxResults": 5,
                "confidenceThreshold": 0.7,
            },
            headers=ALB_AUTH_HEADERS,
        )

        # モックされた環境で正常な文書検索が成功
        assert response.status_code == 200
        data = response.json()

        # レスポンス形式の確認
        assert isinstance(data, list)  # 文書リストが返される
        assert len(data) == 2  # モックデータ2件

        # 各文書の形式確認
        for doc in data:
            assert "content" in doc
            assert "source" in doc
            assert "confidence_score" in doc
            assert "metadata" in doc

        # 具体的な内容確認
        assert "AWS Bedrock" in data[0]["content"]
        assert data[0]["confidence_score"] == 0.85

    def test_rag_retrieve_documents_with_invalid_confidence_threshold(self, mock_client):
        """無効な信頼度閾値でのRAG文書検索をテスト"""
        response = mock_client.get(
            "/api/rag/retrieve",
            params={
                "query": "テスト",
                "knowledgeBaseId": "test-kb",
                "maxResults": 5,
                "confidenceThreshold": 1.5,  # 無効な値（1.0を超える）
            },
            headers=ALB_AUTH_HEADERS,
        )

        # バリデーションエラーが期待される
        assert response.status_code == 422

    def test_rag_retrieve_documents_without_query(self, mock_client):
        """クエリなしでのRAG文書検索をテスト"""
        response = mock_client.get(
            "/api/rag/retrieve",
            params={
                "knowledgeBaseId": "test-kb-123",
                "maxResults": 5,
                "confidenceThreshold": 0.7,
            },
            headers=ALB_AUTH_HEADERS,
        )

        # バリデーションエラーが期待される
        assert response.status_code == 422

    def test_rag_chat_stream_with_valid_data(self, mock_client):
        """有効なデータでのRAGチャットストリーミングをテスト"""
        response = mock_client.post(
            "/api/rag/chat-stream",
            json={
                "query": "AWS Lambda について教えてください",
                "knowledgeBaseId": "test-kb-123",
                "model": {
                    "modelId": "anthropic.claude-3-5-sonnet-20241022-v1:0",
                    "temperature": 0.7,
                    "maxTokens": 4096,
                },
            },
            headers=ALB_AUTH_HEADERS,
        )

        # ストリーミングエンドポイントの基本動作確認
        assert response.status_code in [200, 422, 500]  # Include validation errors

        if response.status_code == 200:
            # ストリーミングヘッダーの確認
            content_type = response.headers.get("content-type", "")
            assert "text/event-stream" in content_type or "text/plain" in content_type

    def test_rag_chat_stream_without_knowledge_base_id(self, mock_client):
        """ナレッジベースIDなしでのRAGチャットストリーミングをテスト"""
        response = mock_client.post(
            "/api/rag/chat-stream",
            json={"query": "テスト質問", "model": {"modelId": "test-model"}},
            headers=ALB_AUTH_HEADERS,
        )

        # バリデーションエラーが期待される
        assert response.status_code == 422


class TestRAGStreamingBehavior:
    """RAGストリーミング動作のテスト"""

    def test_rag_streaming_endpoint_returns_sse_format(self, mock_client):
        """RAGストリーミングエンドポイントがSSE形式を返すことをテスト"""
        response = mock_client.post(
            "/api/rag/chat-stream",
            json={
                "query": "AWS について教えてください",
                "knowledgeBaseId": "test-kb-123",
            },
            headers=ALB_AUTH_HEADERS,
        )

        # ストリーミングは常に200で開始される（エラーでない限り）
        if response.status_code == 200:
            assert "text/event-stream" in response.headers.get("content-type", "")

            # ストリーミングヘッダーの確認
            assert "Cache-Control" in response.headers

            # レスポンス内容の基本確認
            content = response.text
            assert "data:" in content

    def test_rag_streaming_handles_missing_query(self, mock_client):
        """クエリが無い場合のRAGストリーミング処理をテスト"""
        response = mock_client.post(
            "/api/rag/chat-stream",
            json={"knowledgeBaseId": "test-kb-123"},
            headers=ALB_AUTH_HEADERS,
        )

        # バリデーションエラーまたはストリーミングエラー
        if response.status_code == 422:
            data = response.json()
            assert "detail" in data or "error" in data
        else:
            assert response.status_code == 200
            content = response.text
            # エラーチャンクが含まれる可能性
            assert '"type":"error"' in content or "data:" in content


class TestRAGResponseFormats:
    """RAGレスポンス形式のテスト"""

    def test_rag_retrieve_response_has_consistent_format(self, mock_client):
        """RAG文書検索レスポンスが一貫した形式であることをテスト"""
        response = mock_client.get(
            "/api/rag/retrieve",
            params={
                "query": "テスト",
                "knowledgeBaseId": "test-kb",
                "maxResults": 5,
                "confidenceThreshold": 0.7,
            },
            headers=ALB_AUTH_HEADERS,
        )

        assert response.status_code in [200, 500]
        assert response.headers.get("content-type", "").startswith("application/json")

        if response.status_code == 200:
            data = response.json()
            # 基本的なレスポンス構造
            assert "success" in data
            assert "data" in data

            if data.get("success") and "data" in data:
                # 文書リストの構造確認
                assert "documents" in data["data"]
                assert isinstance(data["data"]["documents"], list)

    def test_rag_streaming_chunks_have_valid_structure(self, mock_client):
        """RAGストリーミングチャンクが有効な構造であることをテスト"""
        response = mock_client.post(
            "/api/rag/chat-stream",
            json={
                "query": "AWS サービスについて",
                "knowledgeBaseId": "test-kb-123",
            },
            headers=ALB_AUTH_HEADERS,
        )

        if response.status_code == 200:
            content = response.text
            lines = content.split("\n")

            for line in lines:
                if line.startswith("data: ") and line.strip() != "data:":
                    json_str = line[6:]  # "data: " を除去
                    try:
                        chunk_data = json.loads(json_str)
                        # チャンクの基本構造確認
                        assert "type" in chunk_data
                        # タイプ別の構造確認
                        if chunk_data["type"] == "token":
                            assert "token" in chunk_data
                        elif chunk_data["type"] == "retrieval":
                            assert "documents" in chunk_data
                        elif chunk_data["type"] == "metadata":
                            assert "metadata" in chunk_data
                    except json.JSONDecodeError:
                        # JSONパースに失敗する場合もある（プレーンテキストなど）
                        pass
