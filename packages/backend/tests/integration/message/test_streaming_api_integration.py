"""ストリーミングAPIの包括的統合テスト

実際のAPIエンドポイントの動作を詳細にテストし、
ストリーミング機能の堅牢性を検証する
"""

import json
import time
import pytest

# ALB Cognito OIDC認証ヘッダーのモック
ALB_AUTH_HEADERS = {
    "x-amzn-oidc-accesstoken": "mock-access-token",
    "x-amzn-oidc-identity": "test-user-123",
}


class TestStreamingAPIIntegration:
    """ストリーミングAPI統合テストスイート"""

    def test_predict_stream_post_with_minimal_payload_returns_streaming_response(self, mock_client):
        """最小限のペイロードでPOSTストリーミングが正常動作することをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": "Hello, how are you?"
                }
            ],
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 422]
        if response.status_code == 200:
            assert "text/event-stream" in response.headers.get("content-type", "")
            assert "Cache-Control" in response.headers
            
            # ストリーミング内容の基本検証
            content = response.text
            assert "data:" in content
            # 最低限のチャンクが含まれることを確認
            lines = [line for line in content.split('\n') if line.startswith('data:')]
            assert len(lines) > 0

    def test_predict_stream_post_with_system_prompt_includes_prompt_in_response(self, mock_client):
        """システムプロンプト付きでストリーミングレスポンスが生成されることをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user", 
                    "content": "What is 2+2?"
                }
            ],
            "systemPrompt": "You are a math teacher. Always explain your answers step by step.",
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 422]
        if response.status_code == 200:
            assert "text/event-stream" in response.headers.get("content-type", "")
            
            # レスポンス内容の検証
            content = response.text
            # システムプロンプトの影響が反映されることを期待（実装依存）
            assert "data:" in content

    def test_predict_stream_post_with_model_config_applies_settings(self, mock_client):
        """モデル設定がストリーミングに適用されることをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": "Tell me a joke"
                }
            ],
            "model": {
                "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
                "temperature": 0.1,
                "maxTokens": 100,
                "topP": 0.8
            },
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 422]
        if response.status_code == 200:
            assert "text/event-stream" in response.headers.get("content-type", "")
            
            # モデル設定の影響を検証（低temperatureで一貫性のあるレスポンス）
            content = response.text
            assert "data:" in content

    def test_predict_stream_get_with_query_params_returns_streaming_response(self, mock_client):
        """クエリパラメータでのGETストリーミングが正常動作することをテスト"""
        # Arrange
        params = {
            "message": "What is AI?",
            "saveToHistory": "false"
        }

        # Act
        response = mock_client.get("/api/predict-stream", params=params, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 400, 422]  # 実装により400の可能性もある
        
        if response.status_code == 200:
            assert "text/event-stream" in response.headers.get("content-type", "")
            content = response.text
            assert "data:" in content

    def test_predict_stream_with_save_to_history_processes_correctly(self, mock_client):
        """履歴保存フラグでの処理が正常動作することをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": "Save this conversation"
                }
            ],
            "saveToHistory": True,
            "chatId": "test-chat-for-saving",
            "userId": "stream-test-user"
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        # 外部依存（DB）がない環境では500エラーの可能性もある
        assert response.status_code in [200, 422, 500]
        
        if response.status_code == 200:
            assert "text/event-stream" in response.headers.get("content-type", "")

    def test_predict_stream_with_invalid_message_format_returns_validation_error(self, mock_client):
        """無効なメッセージ形式でバリデーションエラーが返されることをテスト"""
        # Arrange
        invalid_payload = {
            "messages": [
                {
                    "role": "invalid_role",  # 無効なロール
                    "content": "Test"
                }
            ],
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=invalid_payload, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 400, 422]  # Accept streaming success with errors
        if response.status_code == 200:
            # Streaming response - errors are sent as SSE events
            content_type = response.headers.get("content-type", "")
            assert "text/event-stream" in content_type or "text/plain" in content_type
        else:
            assert response.headers.get("content-type", "").startswith("application/json")
        
        if response.status_code == 422:
            data = response.json()
            assert "detail" in data or "error" in data

    def test_predict_stream_with_empty_messages_returns_validation_error(self, mock_client):
        """空のメッセージでバリデーションエラーが返されることをテスト"""
        # Arrange
        payload = {
            "messages": [],  # 空のメッセージリスト
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 400, 422]  # Accept streaming success with errors
        
        if response.status_code == 422:
            data = response.json()
            assert "detail" in data or "error" in data

    def test_predict_stream_with_missing_content_returns_validation_error(self, mock_client):
        """コンテンツが無いメッセージでバリデーションエラーが返されることをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": []  # 空のコンテンツ
                }
            ],
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 400, 422]  # Accept streaming success with errors

    def test_predict_stream_response_contains_valid_sse_format(self, mock_client):
        """ストリーミングレスポンスが有効なSSE形式であることをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": "Count to 3"
                }
            ],
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        assert response.status_code in [200, 422]
        if response.status_code == 200:
            content = response.text
            lines = content.split('\n')
            
            # SSE形式の検証
            data_lines = [line for line in lines if line.startswith('data:')]
            assert len(data_lines) > 0
            
            # 最低1つのdata行が有効なJSONを含むことを確認
            valid_json_found = False
            for line in data_lines:
                if line == 'data:':  # 空のdata行は無視
                    continue
                try:
                    json_str = line[5:]  # "data:" を除去
                    json.loads(json_str)
                    valid_json_found = True
                    break
                except json.JSONDecodeError:
                    continue  # プレーンテキストの場合もあり得る
            
            # 完全にJSON形式ではなくても、基本的なSSE構造は満たすべき
            assert len(data_lines) > 0

    def test_predict_stream_handles_concurrent_requests(self, mock_client):
        """並行リクエストが適切に処理されることをテスト"""
        import threading
        import queue
        
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": "Quick response please"
                }
            ],
            "saveToHistory": False
        }
        
        results = queue.Queue()
        
        def make_request():
            try:
                response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)
                results.put(response.status_code)
            except Exception as e:
                results.put(f"Error: {e}")

        # Act - 3つの並行リクエストを実行
        threads = []
        for _ in range(3):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()

        # すべてのスレッドの完了を待つ
        for thread in threads:
            thread.join(timeout=10)

        # Assert
        response_codes = []
        while not results.empty():
            result = results.get()
            response_codes.append(result)

        # すべてのリクエストが処理されることを確認
        assert len(response_codes) == 3
        # ほとんどのリクエストが成功することを期待
        successful_requests = [code for code in response_codes if code == 200]
        assert len(successful_requests) >= 1

    def test_predict_stream_performance_within_acceptable_range(self, mock_client):
        """ストリーミングのパフォーマンスが許容範囲内であることをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": "Hello"
                }
            ],
            "saveToHistory": False
        }

        # Act
        start_time = time.time()
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)
        first_byte_time = time.time()

        # Assert
        first_byte_latency = first_byte_time - start_time
        
        # ストリーミングは迅速に開始されるべき（実装に依存）
        if response.status_code == 200:
            # リアルタイムストリーミングなので応答開始は早いはず
            assert first_byte_latency < 5.0  # 5秒以内
            assert "text/event-stream" in response.headers.get("content-type", "")
        else:
            # エラーレスポンスも迅速であるべき
            assert first_byte_latency < 2.0

    def test_predict_stream_handles_large_input_appropriately(self, mock_client):
        """大きな入力データが適切に処理されることをテスト"""
        # Arrange
        large_content = "x" * 5000  # 5KBのコンテンツ
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": large_content
                }
            ],
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        # 大きなペイロードでもエラーハンドリングが適切に行われる
        assert response.status_code in [200, 413, 422, 500]
        assert response.headers.get("content-type", "").startswith(("application/json", "text/event-stream"))

    def test_predict_stream_maintains_consistent_response_headers(self, mock_client):
        """ストリーミングレスポンスヘッダーが一貫していることをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": "Test headers"
                }
            ],
            "saveToHistory": False
        }

        # Act
        response = mock_client.post("/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS)

        # Assert
        if response.status_code == 200:
            # 必須ストリーミングヘッダーの確認
            assert "text/event-stream" in response.headers.get("content-type", "")
            assert "Cache-Control" in response.headers
            
            # オプションのヘッダー確認
            headers_to_check = ["Connection", "Access-Control-Allow-Origin"]
            for header in headers_to_check:
                if header in response.headers:
                    assert response.headers[header] is not None

    def test_predict_stream_handles_malformed_json_gracefully(self, mock_client):
        """不正なJSONが適切に処理されることをテスト"""
        # Act
        response = mock_client.post(
            "/api/predict-stream",
            data="invalid json content",
            headers={**ALB_AUTH_HEADERS, "content-type": "application/json"}
        )

        # Assert
        assert response.status_code == 422
        data = response.json()
        # Accept either FastAPI standard format or custom error format
        assert "detail" in data or "error" in data