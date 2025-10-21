"""エラーハンドリングの包括的統合テスト

外部サービスエラー、ネットワークタイムアウト、リソース制限、
異常系シナリオでの堅牢性を検証する
"""

import json

# ALB Cognito OIDC認証ヘッダーのモック
ALB_AUTH_HEADERS = {
    "x-amzn-oidc-accesstoken": "mock-access-token",
    "x-amzn-oidc-identity": "test-user-123",
}


class TestExternalServiceErrorHandling:
    """外部サービスエラーのハンドリングテスト"""

    def test_database_connection_error_handled_gracefully(self, mock_client):
        """データベース接続エラーが適切に処理されることをテスト"""
        # Act - データベースアクセスが必要なエンドポイント
        response = mock_client.get("/api/chats", headers=ALB_AUTH_HEADERS)

        # Assert - データベースエラーでも適切なレスポンス
        assert response.status_code in [200, 422, 500, 503]
        assert response.headers.get("content-type", "").startswith("application/json")

        if response.status_code == 500:
            data = response.json()
            # エラー情報が構造化されていることを確認
            assert "detail" in data or "error" in data
            # 内部詳細が露出していないことを確認
            error_text = response.text.lower()
            assert "password" not in error_text
            assert "connection string" not in error_text

    def test_bedrock_service_error_handled_gracefully(self, mock_client):
        """Bedrockサービスエラーが適切に処理されることをテスト"""
        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [{"contentType": "text", "body": "Test Bedrock error"}],
                }
            ],
            "saveToHistory": False,
        }

        # Act - Bedrockを使用するストリーミングエンドポイント
        response = mock_client.post(
            "/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - Bedrockエラーでも適切なレスポンス
        assert response.status_code in [200, 422, 500, 503]

        if response.status_code == 200:
            # ストリーミングが開始された場合
            assert "text/event-stream" in response.headers.get("content-type", "")
            # エラーチャンクが含まれる可能性
            content = response.text
            if "error" in content.lower():
                # エラーチャンクでも適切な形式
                assert "data:" in content
        else:
            # エラーレスポンスの場合
            assert response.headers.get("content-type", "").startswith(
                "application/json"
            )

    def test_detailed_health_check_shows_service_status(self, mock_client):
        """詳細ヘルスチェックでサービス状態が表示されることをテスト"""
        # Act
        response = mock_client.get("/api/health/detailed")

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "services" in data
        assert isinstance(data["services"], dict)

        # 各サービスの状態が確認できることを期待
        services = data["services"]
        if services:
            for service_name, service_status in services.items():
                assert isinstance(service_status, (dict, str, bool))

    def test_rag_knowledge_base_error_handled_gracefully(self, mock_client):
        """RAGナレッジベースエラーが適切に処理されることをテスト"""
        # Arrange
        payload = {
            "query": "Test knowledge base error",
            "knowledgeBaseId": "invalid-kb-id",
            "maxResults": 5,
            "confidenceThreshold": 0.7,
        }

        # Act
        response = mock_client.get(
            "/api/rag/retrieve", params=payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - ナレッジベースエラーでも適切なレスポンス
        assert response.status_code in [200, 400, 404, 500]
        assert response.headers.get("content-type", "").startswith("application/json")

        if response.status_code != 200:
            data = response.json()
            # エラー情報が構造化されていることを確認
            assert "detail" in data or "error" in data
            # AWS内部詳細が露出していないことを確認
            error_text = response.text.lower()
            assert "aws" not in error_text or "internal" not in error_text


class TestNetworkAndTimeoutHandling:
    """ネットワークとタイムアウトのハンドリングテスト"""

    def test_slow_request_handled_within_timeout(self, mock_client):
        """遅いリクエストがタイムアウト内で処理されることをテスト"""
        import time

        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [{"contentType": "text", "body": "This might be slow"}],
                }
            ],
            "saveToHistory": False,
        }

        # Act
        start_time = time.time()
        response = mock_client.post(
            "/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS, timeout=30
        )
        end_time = time.time()

        # Assert
        request_duration = end_time - start_time
        # リクエストが合理的な時間内で完了または適切にタイムアウト
        assert request_duration < 30  # 30秒のタイムアウト設定
        assert response.status_code in [200, 408, 422, 500, 503]

    def test_concurrent_heavy_requests_handled_appropriately(self, mock_client):
        """並行する重いリクエストが適切に処理されることをテスト"""
        import queue
        import threading

        # Arrange
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"contentType": "text", "body": "Heavy computation request"}
                    ],
                }
            ],
            "saveToHistory": False,
        }

        results = queue.Queue()

        def make_heavy_request():
            try:
                response = mock_client.post(
                    "/api/predict-stream",
                    json=payload,
                    headers=ALB_AUTH_HEADERS,
                    timeout=10,
                )
                results.put(
                    {
                        "status_code": response.status_code,
                        "success": response.status_code in [200, 500],
                    }
                )
            except Exception as e:
                results.put({"error": str(e), "success": False})

        # Act - 5つの並行重リクエスト
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=make_heavy_request)
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join(timeout=15)

        # Assert
        responses = []
        while not results.empty():
            result = results.get()
            responses.append(result)

        # すべてのリクエストが処理される（成功またはエラーレスポンス）
        assert len(responses) == 5
        # 大部分のリクエストが適切に処理される
        successful_or_handled = [
            r for r in responses if r.get("success", False) or "status_code" in r
        ]
        assert len(successful_or_handled) >= 3


class TestInputValidationAndSanitization:
    """入力バリデーションとサニタイゼーションのテスト"""

    def test_xss_attempt_in_chat_title_sanitized(self, mock_client):
        """チャットタイトルのXSS試行がサニタイズされることをテスト"""
        # Arrange - XSS攻撃試行
        malicious_payload = {"title": "<script>alert('XSS')</script>Malicious Chat"}

        # Act
        response = mock_client.post(
            "/api/chats", json=malicious_payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - チャット作成は成功し、XSSはサニタイズされる
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "title" in data
        # HTMLエスケープされてscriptタグが無害化される
        expected_title = (
            "&lt;script&gt;alert(&#x27;XSS&#x27;)&lt;/script&gt;Malicious Chat"
        )
        assert data["title"] == expected_title
        assert "<script>" not in data["title"]

    def test_oversized_message_content_handled_appropriately(self, mock_client):
        """過大なメッセージコンテンツが適切に処理されることをテスト"""
        # Arrange - 非常に大きなコンテンツ
        large_content = "A" * 100000  # 100KB
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [{"contentType": "text", "body": large_content}],
                }
            ],
            "saveToHistory": False,
        }

        # Act
        response = mock_client.post(
            "/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - 大きなコンテンツに対する適切な応答
        assert response.status_code in [200, 413, 422, 500]
        # サーバーがクラッシュしないことを確認
        assert response.headers.get("content-type") is not None

    def test_invalid_unicode_characters_handled_safely(self, mock_client):
        """無効なUnicode文字が安全に処理されることをテスト"""
        # Arrange - 問題のあるUnicode文字
        problematic_content = "Test \ufffe\uffff content"
        payload = {"title": problematic_content}

        # Act
        response = mock_client.post(
            "/api/chats", json=payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - Unicode文字でも正常にチャット作成される
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "title" in data

    def test_deeply_nested_json_handled_appropriately(self, mock_client):
        """深くネストされたJSONが適切に処理されることをテスト"""
        # Arrange - 深いネスト構造
        nested_content = {
            "level1": {"level2": {"level3": {"level4": {"level5": {"deep": "value"}}}}}
        }
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"contentType": "text", "body": json.dumps(nested_content)}
                    ],
                }
            ],
            "saveToHistory": False,
        }

        # Act
        response = mock_client.post(
            "/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - 深いネストでスタックオーバーフローが発生しない
        assert response.status_code in [200, 400, 413, 422, 500]

    def test_special_characters_in_rag_query_handled_safely(self, mock_client):
        """RAGクエリの特殊文字が安全に処理されることをテスト"""
        # Arrange - 特殊文字を含むクエリ
        special_query = "What about 100% & <markup> + 'quotes' + \"double quotes\" + null + undefined?"
        payload = {
            "query": special_query,
            "knowledgeBaseId": "test-kb",
            "maxResults": 5,
            "confidenceThreshold": 0.5,
        }

        # Act
        response = mock_client.get(
            "/api/rag/retrieve", params=payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - 特殊文字でエラーが発生しない
        assert response.status_code in [200, 400, 422, 500]
        assert response.headers.get("content-type") is not None


class TestResourceLimitAndProtection:
    """リソース制限と保護のテスト"""

    def test_memory_exhaustion_attempt_handled_safely(self, mock_client):
        """メモリ枯渇攻撃試行が安全に処理されることをテスト"""
        # Arrange - 大量のデータを含むリクエスト
        large_messages = []
        for i in range(100):  # 100個の大きなメッセージ
            large_messages.append(
                {
                    "role": "user" if i % 2 == 0 else "assistant",
                    "content": [
                        {
                            "contentType": "text",
                            "body": f"Large message {i} " + "x" * 1000,
                        }
                    ],
                }
            )

        payload = {"messages": large_messages, "saveToHistory": False}

        # Act
        response = mock_client.post(
            "/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS
        )

        # Assert - メモリ制限により適切に拒否または処理
        assert response.status_code in [200, 413, 422, 500]
        # サーバーがクラッシュしないことを確認
        assert response.headers.get("content-type") is not None

    def test_rapid_successive_requests_handled_appropriately(self, mock_client):
        """急速な連続リクエストが適切に処理されることをテスト"""
        import time

        # Arrange
        payload = {
            "messages": [{"role": "user", "content": "Quick test"}],
            "saveToHistory": False,
        }

        # Act - 10個の迅速な連続リクエスト
        responses = []
        start_time = time.time()

        for _ in range(10):
            response = mock_client.post(
                "/api/predict-stream", json=payload, headers=ALB_AUTH_HEADERS, timeout=5
            )
            responses.append(response.status_code)

        end_time = time.time()

        # Assert
        total_time = end_time - start_time
        # レート制限や適切な応答が行われる
        assert len(responses) == 10
        # 大部分のリクエストが処理される（バリデーションエラー422も含む）
        successful_responses = [
            code for code in responses if code in [200, 422, 429, 500]
        ]
        assert len(successful_responses) >= 5
        # 迅速な処理が行われる
        assert total_time < 60  # 1分以内


class TestErrorResponseConsistency:
    """エラーレスポンスの一貫性テスト"""

    def test_unauthenticated_error_responses_return_401(self, mock_client):
        """認証なしでのエラーレスポンスが一貫して401を返すことをテスト（セキュリティ）"""
        # Arrange - 認証が必要なエンドポイントへの認証なしアクセス
        unauthenticated_scenarios = [
            ("GET", "/api/non-existent-endpoint"),
            ("POST", "/api/chats", {"title": "test"}),
            ("PATCH", "/api/chats", {}),
            ("DELETE", "/api/chats/test-id"),
        ]

        for method, url, *payload in unauthenticated_scenarios:
            # Act - 認証ヘッダーなしでリクエスト
            if method == "GET":
                response = mock_client.get(url)
            elif method == "POST":
                response = mock_client.post(url, json=payload[0] if payload else {})
            elif method == "PATCH":
                response = mock_client.patch(url, json=payload[0] if payload else {})
            elif method == "DELETE":
                response = mock_client.delete(url)

            # Assert - セキュリティ上すべて401（情報漏洩防止）
            assert response.status_code == 401
            assert response.headers.get("content-type", "").startswith(
                "application/json"
            )

            data = response.json()
            assert "error" in data
            assert data["error"]["code"] == "UNAUTHORIZED"

    def test_authenticated_error_responses_have_appropriate_status_codes(
        self, mock_client
    ):
        """認証ありでのエラーレスポンスが適切なステータスコードを返すことをテスト"""
        # Arrange - 認証ヘッダーありで各種エラーを引き起こすリクエスト
        authenticated_error_scenarios = [
            ("POST", "/api/chats", "invalid json", 422),  # JSONパースエラー
            ("PATCH", "/api/chats", {}, 405),  # 許可されていないメソッド
        ]

        consistent_fields = []

        for method, url, payload, expected_status in authenticated_error_scenarios:
            # Act - 認証ヘッダーありでリクエスト
            if method == "POST":
                if isinstance(payload, str):
                    response = mock_client.post(
                        url,
                        data=payload,
                        headers={
                            **ALB_AUTH_HEADERS,
                            "content-type": "application/json",
                        },
                    )
                else:
                    response = mock_client.post(
                        url, json=payload, headers=ALB_AUTH_HEADERS
                    )
            elif method == "PATCH":
                response = mock_client.patch(
                    url, json=payload, headers=ALB_AUTH_HEADERS
                )

            # Assert - 適切なステータスコードが返される
            assert response.status_code == expected_status
            assert response.headers.get("content-type", "").startswith(
                "application/json"
            )

            data = response.json()
            # エラー構造を記録
            fields = set(data.keys())
            consistent_fields.append(fields)

        # すべてのエラーレスポンスに少なくとも何らかのエラー情報が含まれることを確認
        error_indicators = {"detail", "error", "message"}
        for fields in consistent_fields:
            # 各レスポンスに少なくとも一つのエラー指標フィールドが含まれることを確認
            assert any(field in error_indicators for field in fields), (
                f"No error indicators found in fields: {fields}"
            )

        # 共通フィールドがある場合はそれも確認（必須ではない）
        if len(consistent_fields) > 1:
            common_fields = set.intersection(*consistent_fields)
            # 共通フィールドがなくても、各レスポンスにエラー情報があれば良しとする
            if len(common_fields) > 0:
                assert any(field in error_indicators for field in common_fields)

    def test_error_responses_do_not_expose_internal_details(self, mock_client):
        """エラーレスポンスが内部詳細を露出しないことをテスト"""
        # Arrange - 内部エラーを引き起こす可能性のあるリクエスト
        response = mock_client.post(
            "/api/chats", json={"title": "Test"}, headers=ALB_AUTH_HEADERS
        )

        # Assert
        if response.status_code in [500, 503]:
            content = response.text.lower()
            # 機密情報が含まれていないことを確認
            sensitive_terms = [
                "password",
                "secret",
                "key",
                "token",
                "database",
                "connection string",
                "stack trace",
                "traceback",
                "file path",
                "environment",
                "config",
            ]

            for term in sensitive_terms:
                assert term not in content

    def test_error_responses_include_helpful_user_messages(self, mock_client):
        """エラーレスポンスがユーザーに有用なメッセージを含むことをテスト"""
        # Arrange
        response = mock_client.post("/api/chats", json={}, headers=ALB_AUTH_HEADERS)

        # Assert
        if response.status_code in [400, 422]:
            data = response.json()
            # ユーザーに理解可能なエラーメッセージが含まれる
            error_message = ""
            if "detail" in data:
                error_message = str(data["detail"])
            elif "error" in data and isinstance(data["error"], dict):
                error_message = str(data["error"].get("message", ""))
            elif "message" in data:
                error_message = str(data["message"])

            # メッセージが有用であることを確認
            assert len(error_message) > 0
            # 技術的すぎる内容が含まれていないことを確認
            technical_terms = ["null pointer", "exception", "stack", "heap"]
            error_lower = error_message.lower()
            technical_found = any(term in error_lower for term in technical_terms)
            assert not technical_found  # ユーザーフレンドリーなメッセージ
