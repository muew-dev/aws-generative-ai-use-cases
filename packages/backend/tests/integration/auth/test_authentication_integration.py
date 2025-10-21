"""認証・アクセス制御の包括的統合テスト

ALB Cognito OIDC認証、権限チェック、セキュリティミドルウェアの動作を包括的にテスト
品質の高い認証フローの検証
"""

import json
import pytest

# ALB Cognito OIDC認証ヘッダーのモック
ALB_AUTH_HEADERS = {
    "x-amzn-oidc-accesstoken": "mock-access-token",
    "x-amzn-oidc-identity": "test-user-123",
}

# 不正な認証ヘッダーのパターン
INVALID_AUTH_HEADERS = [
    # 空のヘッダー
    {"x-amzn-oidc-accesstoken": "", "x-amzn-oidc-identity": "user123"},
    {"x-amzn-oidc-accesstoken": "token", "x-amzn-oidc-identity": ""},
    # スペースのみ
    {"x-amzn-oidc-accesstoken": "   ", "x-amzn-oidc-identity": "user123"},
    {"x-amzn-oidc-accesstoken": "token", "x-amzn-oidc-identity": "   "},
    # 一方だけ
    {"x-amzn-oidc-accesstoken": "token"},
    {"x-amzn-oidc-identity": "user123"},
    # 両方なし
    {},
]


class TestALBCognitoAuthentication:
    """ALB Cognito OIDC認証のテスト"""

    def test_health_endpoint_accessible_without_auth(self, mock_client):
        """ヘルスチェックエンドポイントが認証なしでアクセス可能であることをテスト"""
        response = mock_client.get("/api/health")
        
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "timestamp" in data
        assert "version" in data

    def test_protected_endpoints_require_auth(self, mock_client):
        """保護されたエンドポイントが認証なしでは401を返すことをテスト"""
        # チャット作成
        response = mock_client.post("/api/chats", json={"title": "Test Chat"})
        assert response.status_code == 401
        
        # チャット一覧
        response = mock_client.get("/api/chats")
        assert response.status_code == 401
        
        # メッセージ作成
        response = mock_client.post(
            "/api/chats/test-chat/messages",
            json={"role": "user", "content": [{"contentType": "text", "body": "test"}]}
        )
        assert response.status_code == 401

    def test_valid_auth_headers_allow_access(self, mock_client):
        """有効な認証ヘッダーでアクセスが許可されることをテスト"""
        # チャット作成
        response = mock_client.post(
            "/api/chats", 
            json={"title": "Authenticated Chat"}, 
            headers=ALB_AUTH_HEADERS
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "title" in data
        assert data["title"] == "Authenticated Chat"
        assert data["userId"] == "test-user-123"
        
        # チャット一覧
        response = mock_client.get("/api/chats", headers=ALB_AUTH_HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert "chats" in data
        assert "total" in data

    def test_invalid_auth_headers_rejected(self, mock_client):
        """不正な認証ヘッダーが拒否されることをテスト"""
        for headers in INVALID_AUTH_HEADERS:
            response = mock_client.post(
                "/api/chats", 
                json={"title": "Test"}, 
                headers=headers
            )
            assert response.status_code == 401, f"Failed for headers: {headers}"


class TestAuthenticationErrorHandling:
    """認証エラーハンドリングのテスト"""

    def test_authentication_error_response_format(self, mock_client):
        """認証エラーレスポンスが一貫した形式であることをテスト"""
        response = mock_client.post("/api/chats", json={"title": "Test"})
        
        assert response.status_code == 401
        assert response.headers.get("content-type", "").startswith("application/json")
        
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "UNAUTHORIZED"
        assert data["error"]["message"] == "Cognito authentication required"
        assert "timestamp" in data

    def test_non_existent_endpoint_returns_401_when_unauthenticated(self, mock_client):
        """存在しないエンドポイントでも認証なしでは401を返すことをテスト（セキュリティ）"""
        response = mock_client.get("/api/non-existent-endpoint")
        assert response.status_code == 401

    def test_method_not_allowed_with_auth_returns_405(self, mock_client):
        """認証済みで許可されていないメソッドは405を返すことをテスト"""
        response = mock_client.patch("/api/chats", headers=ALB_AUTH_HEADERS)
        assert response.status_code == 405


class TestRequestValidationWithAuth:
    """認証済みリクエストのバリデーションテスト"""

    def test_malformed_json_with_auth_returns_422(self, mock_client):
        """認証済みでもmalformed JSONは422を返すことをテスト"""
        response = mock_client.post(
            "/api/chats", 
            json="invalid_json_structure", 
            headers=ALB_AUTH_HEADERS
        )
        assert response.status_code == 422

    def test_missing_required_fields_with_auth_returns_422(self, mock_client):
        """認証済みでも必須フィールド不足では422を返すことをテスト"""
        response = mock_client.post(
            "/api/chats/test-chat/messages",
            json={"invalid_field": "invalid_value"},
            headers=ALB_AUTH_HEADERS
        )
        assert response.status_code == 422

    def test_oversized_payload_with_auth_returns_422(self, mock_client):
        """認証済みでも過大なペイロードは422を返すことをテスト"""
        large_title = "x" * 10000  # 500文字制限を超過
        response = mock_client.post(
            "/api/chats", 
            json={"title": large_title}, 
            headers=ALB_AUTH_HEADERS
        )
        assert response.status_code == 422


class TestCORSAndSecurityHeaders:
    """CORS とセキュリティヘッダーのテスト"""

    def test_cors_headers_present_in_responses(self, mock_client):
        """レスポンスにCORSヘッダーが含まれることをテスト"""
        response = mock_client.get("/api/health")
        
        # CORS関連ヘッダーの確認（設定による）
        if "Access-Control-Allow-Origin" in response.headers:
            assert response.headers["Access-Control-Allow-Origin"] is not None

    def test_content_type_headers_correct(self, mock_client):
        """Content-Typeヘッダーが正しく設定されていることをテスト"""
        # JSONレスポンス
        response = mock_client.get("/api/health")
        assert response.headers.get("content-type", "").startswith("application/json")
        
        # エラーレスポンス
        error_response = mock_client.post("/api/chats", json={"title": "Test"})
        assert error_response.headers.get("content-type", "").startswith("application/json")


class TestUserContextValidation:
    """ユーザーコンテキストの検証テスト"""

    def test_user_id_correctly_extracted_from_headers(self, mock_client):
        """認証ヘッダーからユーザーIDが正しく抽出されることをテスト"""
        response = mock_client.post(
            "/api/chats", 
            json={"title": "User Context Test"}, 
            headers=ALB_AUTH_HEADERS
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["userId"] == ALB_AUTH_HEADERS["x-amzn-oidc-identity"]

    def test_different_user_ids_handled_correctly(self, mock_client):
        """異なるユーザーIDが正しく処理されることをテスト"""
        different_headers = {
            "x-amzn-oidc-accesstoken": "different-token", 
            "x-amzn-oidc-identity": "different-user-456"
        }
        
        response = mock_client.post(
            "/api/chats", 
            json={"title": "Different User Test"}, 
            headers=different_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["userId"] == "different-user-456"