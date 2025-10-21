"""共通テストフィクスチャと設定

全テストファイルで使用する共通の設定、フィクスチャ、ユーティリティを定義
"""

import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

# パス設定
backend_path = Path(__file__).parent.parent
src_path = backend_path / "src"
sys.path.insert(0, str(src_path))

# テスト用環境変数の統一設定
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_db"
os.environ["AWS_REGION"] = "ap-northeast-1"
os.environ["BEDROCK_MODEL_ID"] = "anthropic.claude-3-5-sonnet-20241022-v2:0"

# ALB Cognito OIDC認証ヘッダー（全テストで統一）
ALB_AUTH_HEADERS = {
    "x-amzn-oidc-accesstoken": "mock-access-token",
    "x-amzn-oidc-identity": "test-user-123",
}


@pytest.fixture(scope="function")
def auth_headers():
    """認証ヘッダーを提供するフィクスチャ"""
    return ALB_AUTH_HEADERS


@pytest.fixture(scope="function")
def mock_client():
    """共通のテストクライアントフィクスチャ（適切にモックされた環境）"""
    import unittest.mock

    from main import app

    # Prismaクライアントとレポジトリを包括的にモック
    mock_prisma_client = AsyncMock()
    mock_prisma_client.connect = AsyncMock()
    mock_prisma_client.disconnect = AsyncMock()

    # Prismaのクエリメソッドをモック
    mock_prisma_client.user.find_first = AsyncMock(return_value=MOCK_USER)
    mock_prisma_client.user.create = AsyncMock(return_value=MOCK_USER)
    mock_prisma_client.chat.create = AsyncMock(return_value=MOCK_CHAT)
    mock_prisma_client.chat.find_many = AsyncMock(return_value=[MOCK_CHAT])
    mock_prisma_client.chat.count = AsyncMock(return_value=1)
    mock_prisma_client.message.create = AsyncMock(return_value=MOCK_MESSAGE)

    async def mock_initialize(self):
        # データベース接続以外の初期化は実行、Prismaのみモック
        self._prisma_client = mock_prisma_client

    async def mock_cleanup(self):
        # クリーンアップもモック
        pass

    #外部サービスもモック
    mock_bedrock_response = {
        "documents": [
            {
                "content": "AWS Bedrockは、基盤モデルを使用してAIアプリケーションを構築するためのフルマネージドサービスです。",
                "source": "s3://test-bucket/docs/bedrock-guide.pdf",
                "confidence_score": 0.85,
                "metadata": {"document_type": "pdf", "page_number": 1},
            },
            {
                "content": "Bedrockを使用することで、スケーラブルなAIアプリケーションを簡単に構築できます。",
                "source": "s3://test-bucket/docs/bedrock-advanced.pdf",
                "confidence_score": 0.78,
                "metadata": {"document_type": "pdf", "page_number": 3},
            },
        ]
    }

    # DIContainerとレポジトリのメソッドをパッチ
    with (
        unittest.mock.patch(
            "infrastructure.container.di_container.DIContainer.initialize",
            mock_initialize,
        ),
        unittest.mock.patch(
            "infrastructure.container.di_container.DIContainer.cleanup", mock_cleanup
        ),
        unittest.mock.patch(
            "infrastructure.external.bedrock_rag_repository.BedrockRAGRepository.retrieve_documents",
            AsyncMock(return_value=mock_bedrock_response["documents"]),
        ),
    ):
        # Context managerでlifespanイベントを実行（モック使用）
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client


class MockEntity:
    """テスト用モックエンティティ（to_dict メソッド付き）"""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

    def to_dict(self):
        return {
            key: value
            for key, value in self.__dict__.items()
            if not key.startswith("_")
        }


# テスト用モックデータ
MOCK_USER = MockEntity(
    id="test-user-123",
    email="test@example.com",
    createdAt=datetime.now(UTC),
    updatedAt=datetime.now(UTC),
)

MOCK_CHAT = MockEntity(
    id="test-chat-456",
    title="Test Chat",
    usecase="chat",
    userId="test-user-123",
    createdAt=datetime.now(UTC),
    updatedAt=datetime.now(UTC),
)

MOCK_MESSAGE = MockEntity(
    id="test-message-789",
    role="user",
    content=[{"contentType": "text", "body": "Hello World"}],
    chatId="test-chat-456",
    createdAt=datetime.now(UTC),
)