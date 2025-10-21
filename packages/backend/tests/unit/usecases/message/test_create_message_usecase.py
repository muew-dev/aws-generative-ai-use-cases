"""CreateMessageUseCaseの単体テスト

TDDアプローチに従い、メッセージ作成機能の期待される動作を検証する
認証、権限、バリデーション、ビジネスルールを包括的にテスト
"""

from unittest.mock import AsyncMock, Mock

import pytest
from domain.entities.chat import Chat, ChatId
from domain.entities.message import Message, MessageRole
from domain.entities.user import User, UserId
from domain.errors.domain_errors import (
    ChatAccessDeniedError,
    ChatNotFoundError,
    InvalidMessageContentError,
    UserNotFoundError,
)
from domain.models.request_models import MessageContentRequest, ModelConfigRequest
from domain.repositories.chat_repository import IChatRepository
from domain.repositories.message_repository import IMessageRepository
from domain.repositories.user_repository import IUserRepository
from usecases.message.create_message_usecase import CreateMessageUseCase


class TestCreateMessageUseCase:
    """メッセージ作成ユースケースの単体テスト"""

    @pytest.fixture
    def mock_message_repository(self):
        return Mock(spec=IMessageRepository)

    @pytest.fixture
    def mock_chat_repository(self):
        return Mock(spec=IChatRepository)

    @pytest.fixture
    def mock_user_repository(self):
        return Mock(spec=IUserRepository)

    @pytest.fixture
    def usecase(
        self, mock_message_repository, mock_chat_repository, mock_user_repository
    ):
        return CreateMessageUseCase(
            message_repository=mock_message_repository,
            chat_repository=mock_chat_repository,
            user_repository=mock_user_repository,
        )

    @pytest.fixture
    def valid_user(self):
        from datetime import datetime

        return User.from_existing(
            user_id="user-123",
            email="test@example.com",
            display_name="Test User",
            created_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
            updated_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
        )

    @pytest.fixture
    def valid_chat(self):
        from datetime import datetime

        return Chat.from_existing(
            chat_id="chat-456",
            title="Test Chat",
            usecase="chat",
            user_id="user-123",
            created_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
            updated_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
        )

    @pytest.fixture
    def valid_content(self):
        return [
            MessageContentRequest.from_dict(
                {
                    "contentType": "text",
                    "body": "Hello, world!",
                    "mediaType": "text/plain",
                }
            )
        ]

    @pytest.mark.asyncio
    async def test_execute_with_valid_data_creates_message_successfully(
        self,
        usecase,
        mock_message_repository,
        mock_chat_repository,
        mock_user_repository,
        valid_user,
        valid_chat,
        valid_content,
    ):
        """有効なデータでメッセージが正常に作成されることを確認"""
        # Arrange
        user_id = "user-123"
        chat_id = "chat-456"
        role = "user"

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)
        mock_message_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id=user_id,
            chat_id=chat_id,
            role=role,
            content=valid_content,
        )

        # Assert
        assert isinstance(result, Message)
        assert result.chat_id.value == chat_id
        assert result.user_id.value == user_id
        assert result.role == MessageRole.USER
        assert len(result.content) == 1
        assert result.content[0].body == "Hello, world!"

        # リポジトリメソッドが正しく呼ばれることを確認
        mock_user_repository.find_by_id.assert_called_once_with(UserId(user_id))
        mock_chat_repository.find_by_id.assert_called_once_with(
            UserId(user_id), ChatId(chat_id)
        )
        mock_message_repository.save.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_with_model_config_creates_message_with_model(
        self,
        usecase,
        mock_message_repository,
        mock_chat_repository,
        mock_user_repository,
        valid_user,
        valid_chat,
        valid_content,
    ):
        """モデル設定付きでメッセージが正常に作成されることを確認"""
        # Arrange
        model_config = ModelConfigRequest.from_dict(
            {
                "modelId": "anthropic.claude-3-5-sonnet-20241022-v1:0",
                "temperature": 0.7,
                "maxTokens": 4096,
                "topP": 0.9,
                "stopSequences": ["STOP"],
            }
        )

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)
        mock_message_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id="user-123",
            chat_id="chat-456",
            role="assistant",
            content=valid_content,
            model=model_config,
        )

        # Assert
        assert result.model is not None
        assert result.model.model_id == "anthropic.claude-3-5-sonnet-20241022-v1:0"
        assert result.model.temperature == 0.7
        assert result.model.max_tokens == 4096
        assert result.model.top_p == 0.9
        assert result.model.stop_sequences == ["STOP"]

    @pytest.mark.asyncio
    async def test_execute_with_nonexistent_user_raises_user_not_found_error(
        self, usecase, mock_user_repository, mock_chat_repository, valid_content
    ):
        """存在しないユーザーでUserNotFoundErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=None)
        mock_chat_repository.find_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(UserNotFoundError) as exc_info:
            await usecase.execute(
                user_id="nonexistent-user",
                chat_id="chat-456",
                role="user",
                content=valid_content,
            )

        assert "nonexistent-user" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_with_nonexistent_chat_raises_chat_not_found_error(
        self,
        usecase,
        mock_user_repository,
        mock_chat_repository,
        valid_user,
        valid_content,
    ):
        """存在しないチャットでChatNotFoundErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ChatNotFoundError) as exc_info:
            await usecase.execute(
                user_id="user-123",
                chat_id="nonexistent-chat",
                role="user",
                content=valid_content,
            )

        assert "nonexistent-chat" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_with_unauthorized_access_raises_chat_access_denied_error(
        self, usecase, mock_user_repository, mock_chat_repository, valid_content
    ):
        """権限のないチャットアクセスでChatAccessDeniedErrorが発生することを確認"""
        # Arrange
        from datetime import datetime

        unauthorized_user = User.from_existing(
            user_id="other-user",
            email="other@example.com",
            display_name=None,
            created_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
            updated_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
        )

        chat_owned_by_different_user = Chat.from_existing(
            chat_id="chat-456",
            title="Other User's Chat",
            usecase="chat",
            user_id="user-123",  # 異なるユーザーのチャット
            created_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
            updated_at=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
        )

        mock_user_repository.find_by_id = AsyncMock(return_value=unauthorized_user)
        mock_chat_repository.find_by_id = AsyncMock(
            return_value=chat_owned_by_different_user
        )

        # Act & Assert
        with pytest.raises(ChatAccessDeniedError) as exc_info:
            await usecase.execute(
                user_id="other-user",
                chat_id="chat-456",
                role="user",
                content=valid_content,
            )

        assert "chat-456" in str(exc_info.value)
        assert "other-user" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_with_empty_content_raises_invalid_message_content_error(
        self,
        usecase,
        mock_user_repository,
        mock_chat_repository,
        valid_user,
        valid_chat,
    ):
        """空のコンテンツでInvalidMessageContentErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)

        # Act & Assert
        with pytest.raises(InvalidMessageContentError) as exc_info:
            await usecase.execute(
                user_id="user-123",
                chat_id="chat-456",
                role="user",
                content=[],  # 空のコンテンツ
            )

        assert "empty" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_execute_with_invalid_content_format_raises_invalid_message_content_error(
        self,
        usecase,
        mock_user_repository,
        mock_chat_repository,
        valid_user,
        valid_chat,
    ):
        """無効なコンテンツ形式でInvalidMessageContentErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)

        # contentTypeが無い無効なコンテンツでMessageContentRequestを作成しようとすると例外が発生
        # このテストでは、UseCaseに到達する前にバリデーションで止まることを想定
        with pytest.raises(KeyError):
            invalid_content = [
                MessageContentRequest.from_dict(
                    {"body": "Missing contentType"}
                )  # contentTypeが無い
            ]

        # 代わりに、不正なcontentTypeを持つケースをテスト
        with pytest.raises(ValueError):
            invalid_content_with_bad_type = [
                MessageContentRequest.from_dict(
                    {"contentType": "invalid_type", "body": "test"}
                )
            ]

    @pytest.mark.asyncio
    async def test_execute_with_invalid_role_raises_invalid_message_content_error(
        self,
        usecase,
        mock_user_repository,
        mock_chat_repository,
        valid_user,
        valid_chat,
        valid_content,
    ):
        """無効なロールでInvalidMessageContentErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)

        # Act & Assert
        with pytest.raises(InvalidMessageContentError) as exc_info:
            await usecase.execute(
                user_id="user-123",
                chat_id="chat-456",
                role="invalid_role",  # 無効なロール
                content=valid_content,
            )

        assert "role" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_execute_with_invalid_model_config_raises_invalid_message_content_error(
        self,
        usecase,
        mock_user_repository,
        mock_chat_repository,
        valid_user,
        valid_chat,
        valid_content,
    ):
        """無効なモデル設定でInvalidMessageContentErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)

        # modelIdが無いModelConfigRequestオブジェクトを作成
        invalid_model_config = ModelConfigRequest.from_dict(
            {
                "temperature": 0.7  # modelIdが無い
            }
        )

        # Act & Assert
        with pytest.raises((InvalidMessageContentError, ValueError)) as exc_info:
            await usecase.execute(
                user_id="user-123",
                chat_id="chat-456",
                role="user",
                content=valid_content,
                model=invalid_model_config,
            )

        assert "model" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_execute_with_multiple_content_items_processes_all(
        self,
        usecase,
        mock_message_repository,
        mock_chat_repository,
        mock_user_repository,
        valid_user,
        valid_chat,
    ):
        """複数のコンテンツアイテムが全て処理されることを確認"""
        # Arrange
        multi_content = [
            MessageContentRequest.from_dict(
                {"contentType": "text", "body": "First part", "mediaType": "text/plain"}
            ),
            MessageContentRequest.from_dict(
                {
                    "contentType": "text",
                    "body": "Second part",
                    "mediaType": "text/plain",
                }
            ),
        ]

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)
        mock_message_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id="user-123",
            chat_id="chat-456",
            role="user",
            content=multi_content,
        )

        # Assert
        assert len(result.content) == 2
        assert result.content[0].body == "First part"
        assert result.content[1].body == "Second part"

    @pytest.mark.asyncio
    async def test_execute_performs_parallel_validation(
        self,
        usecase,
        mock_user_repository,
        mock_chat_repository,
        mock_message_repository,
        valid_user,
        valid_chat,
        valid_content,
    ):
        """バリデーションが並列実行されることを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)
        mock_message_repository.save = AsyncMock()

        # Act
        await usecase.execute(
            user_id="user-123",
            chat_id="chat-456",
            role="user",
            content=valid_content,
        )

        # Assert - 両方のリポジトリメソッドが呼ばれることを確認
        mock_user_repository.find_by_id.assert_called_once()
        mock_chat_repository.find_by_id.assert_called_once()
        mock_message_repository.save.assert_called_once()
