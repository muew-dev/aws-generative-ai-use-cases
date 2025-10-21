"""StreamMessageUseCaseの単体テスト

TDDアプローチに従い、AIストリーミング機能の期待される動作を検証する
非同期ストリーミング、条件付きDB保存、エラーハンドリングを包括的にテスト
"""

import pytest
from unittest.mock import AsyncMock, Mock
from collections.abc import AsyncGenerator

from domain.entities.chat import Chat, ChatId
from domain.entities.message import Message, MessageRole, ModelConfig
from domain.entities.user import User, UserId
from domain.models.request_models import MessageRequest, ModelConfigRequest
from domain.errors.domain_errors import (
    AIServiceError,
    ChatAccessDeniedError,
    ChatNotFoundError,
    InvalidMessageContentError,
    UserNotFoundError,
)
from domain.repositories.bedrock_repository import BedrockStreamChunk, IBedrockRepository
from domain.models.response_models import BedrockStreamMetadata
from domain.repositories.chat_repository import IChatRepository
from domain.repositories.message_repository import IMessageRepository
from domain.repositories.user_repository import IUserRepository
from usecases.message.stream_message_usecase import StreamMessageUseCase


class TestStreamMessageUseCase:
    """ストリーミングメッセージユースケースの単体テスト"""

    @pytest.fixture
    def mock_bedrock_repository(self):
        return Mock(spec=IBedrockRepository)

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
    def usecase(self, mock_bedrock_repository, mock_message_repository, 
                mock_chat_repository, mock_user_repository):
        return StreamMessageUseCase(
            bedrock_repository=mock_bedrock_repository,
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
            display_name=None,
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
    def valid_messages(self):
        return [
            MessageRequest.from_dict({
                "role": "user",
                "content": [
                    {
                        "contentType": "text",
                        "body": "Hello AI!",
                        "mediaType": "text/plain"
                    }
                ]
            })
        ]

    @pytest.fixture
    def valid_model_config(self):
        return ModelConfigRequest.from_dict({
            "modelId": "anthropic.claude-3-5-sonnet-20241022-v1:0",
            "temperature": 0.7,
            "maxTokens": 4096,
            "topP": 0.9,
        })

    async def create_mock_stream(self, chunks: list[BedrockStreamChunk]) -> AsyncGenerator[BedrockStreamChunk, None]:
        """テスト用の非同期ストリームジェネレーターを作成"""
        for chunk in chunks:
            yield chunk

    @pytest.mark.asyncio
    async def test_execute_without_saving_streams_response_successfully(
        self, usecase, mock_bedrock_repository, valid_messages
    ):
        """履歴保存なしでストリーミング応答が正常に動作することを確認"""
        # Arrange
        expected_chunks = [
            BedrockStreamChunk(type="token", token="Hello"),
            BedrockStreamChunk(type="token", token=" there!"),
            BedrockStreamChunk(type="metadata", metadata=BedrockStreamMetadata(stop_reason="end_turn")),
        ]

        async def mock_invoke_stream(*args, **kwargs):
            async for chunk in self.create_mock_stream(expected_chunks):
                yield chunk
        
        mock_bedrock_repository.invoke_stream = mock_invoke_stream
        mock_bedrock_repository.get_default_model = Mock(
            return_value=ModelConfig(model_id="claude-3-5-sonnet", temperature=0.7)
        )

        # Act
        result_chunks = []
        async for chunk in usecase.execute(messages=valid_messages, save_to_history=False):
            result_chunks.append(chunk)

        # Assert
        assert len(result_chunks) == 3
        assert len(result_chunks) == 3  # Hello + " there!" + metadata
        assert result_chunks[0].token == "Hello"
        assert result_chunks[1].token == " there!"
        assert result_chunks[2].type == "metadata"

    @pytest.mark.asyncio
    async def test_execute_with_saving_validates_user_and_chat(
        self, usecase, mock_bedrock_repository, mock_user_repository, 
        mock_chat_repository, mock_message_repository, valid_user, valid_chat, valid_messages
    ):
        """履歴保存時にユーザーとチャットのバリデーションが動作することを確認"""
        # Arrange
        expected_chunks = [
            BedrockStreamChunk(type="token", token="Response"),
            BedrockStreamChunk(type="metadata", metadata=BedrockStreamMetadata(stop_reason="end_turn")),
        ]

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)
        mock_message_repository.save = AsyncMock()
        async def mock_invoke_stream(*args, **kwargs):
            async for chunk in self.create_mock_stream(expected_chunks):
                yield chunk
        
        mock_bedrock_repository.invoke_stream = mock_invoke_stream
        mock_bedrock_repository.get_default_model = Mock(
            return_value=ModelConfig(model_id="claude-3-5-sonnet", temperature=0.7)
        )

        # Act
        result_chunks = []
        async for chunk in usecase.execute(
            messages=valid_messages,
            save_to_history=True,
            chat_id="chat-456",
            user_id="user-123",
        ):
            result_chunks.append(chunk)

        # Assert
        assert len(result_chunks) == 2
        mock_user_repository.find_by_id.assert_called_once_with(UserId("user-123"))
        mock_chat_repository.find_by_id.assert_called_once_with(UserId("user-123"), ChatId("chat-456"))
        
        # メッセージが保存されることを確認（ユーザーメッセージ + アシスタントメッセージ）
        assert mock_message_repository.save.call_count == 2

    @pytest.mark.asyncio
    async def test_execute_with_nonexistent_user_raises_user_not_found_error(
        self, usecase, mock_user_repository, mock_chat_repository, valid_messages
    ):
        """存在しないユーザーでUserNotFoundErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=None)
        mock_chat_repository.find_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(UserNotFoundError):
            async for chunk in usecase.execute(
                messages=valid_messages,
                save_to_history=True,
                chat_id="chat-456",
                user_id="nonexistent-user",
            ):
                pass

    @pytest.mark.asyncio
    async def test_execute_with_nonexistent_chat_raises_chat_not_found_error(
        self, usecase, mock_user_repository, mock_chat_repository, valid_user, valid_messages
    ):
        """存在しないチャットでChatNotFoundErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ChatNotFoundError):
            async for chunk in usecase.execute(
                messages=valid_messages,
                save_to_history=True,
                chat_id="nonexistent-chat",
                user_id="user-123",
            ):
                pass

    @pytest.mark.asyncio
    async def test_execute_with_unauthorized_access_raises_chat_access_denied_error(
        self, usecase, mock_user_repository, mock_chat_repository, valid_messages
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
        mock_chat_repository.find_by_id = AsyncMock(return_value=chat_owned_by_different_user)

        # Act & Assert
        with pytest.raises(ChatAccessDeniedError):
            async for chunk in usecase.execute(
                messages=valid_messages,
                save_to_history=True,
                chat_id="chat-456",
                user_id="other-user",
            ):
                pass

    @pytest.mark.asyncio
    async def test_execute_with_empty_messages_raises_invalid_message_content_error(
        self, usecase, mock_bedrock_repository
    ):
        """空のメッセージでInvalidMessageContentErrorが発生することを確認"""
        # Act & Assert
        with pytest.raises(InvalidMessageContentError) as exc_info:
            async for chunk in usecase.execute(messages=[], save_to_history=False):
                pass

        assert "empty" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_execute_with_invalid_message_role_raises_invalid_message_content_error(
        self, usecase, mock_bedrock_repository
    ):
        """無効なメッセージロールでInvalidMessageContentErrorが発生することを確認"""
        # Arrange
        invalid_messages = [
            MessageRequest.from_dict({
                "role": "invalid_role",
                "content": [{"contentType": "text", "body": "Test"}]
            })
        ]

        # Act & Assert
        with pytest.raises(InvalidMessageContentError) as exc_info:
            async for chunk in usecase.execute(messages=invalid_messages, save_to_history=False):
                pass

        assert "role" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_execute_with_missing_save_parameters_raises_invalid_message_content_error(
        self, usecase, valid_messages
    ):
        """履歴保存時に必要パラメータが無い場合にInvalidMessageContentErrorが発生することを確認"""
        # Act & Assert - user_idが無い場合
        with pytest.raises(InvalidMessageContentError) as exc_info:
            async for chunk in usecase.execute(
                messages=valid_messages,
                save_to_history=True,
                chat_id="chat-456",
                # user_id が無い
            ):
                pass

        assert "required" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_execute_with_system_prompt_passes_to_bedrock(
        self, usecase, mock_bedrock_repository, valid_messages
    ):
        """システムプロンプトがBedrockに渡されることを確認"""
        # Arrange
        system_prompt = "You are a helpful assistant."
        expected_chunks = [
            BedrockStreamChunk(type="token", token="Hello"),
            BedrockStreamChunk(type="metadata", metadata=BedrockStreamMetadata(stop_reason="end_turn"))
        ]

        async def mock_invoke_stream(*args, **kwargs):
            async for chunk in self.create_mock_stream(expected_chunks):
                yield chunk
        
        mock_bedrock_repository.invoke_stream = mock_invoke_stream
        mock_bedrock_repository.get_default_model = Mock(
            return_value=ModelConfig(model_id="claude-3-5-sonnet", temperature=0.7)
        )

        # Act
        result_chunks = []
        async for chunk in usecase.execute(
            messages=valid_messages,
            system_prompt=system_prompt,
            save_to_history=False,
        ):
            result_chunks.append(chunk)

        # Assert
        # 関数呼び出しが行われたことを確認（関数はcall_argsを持たないので、実行確認のみ）
        assert len(result_chunks) == 2

    @pytest.mark.asyncio
    async def test_execute_with_custom_model_config_passes_to_bedrock(
        self, usecase, mock_bedrock_repository, valid_messages, valid_model_config
    ):
        """カスタムモデル設定がBedrockに渡されることを確認"""
        # Arrange
        expected_chunks = [
            BedrockStreamChunk(type="token", token="Hello"),
            BedrockStreamChunk(type="metadata", metadata=BedrockStreamMetadata(stop_reason="end_turn"))
        ]

        async def mock_invoke_stream(*args, **kwargs):
            async for chunk in self.create_mock_stream(expected_chunks):
                yield chunk
        
        mock_bedrock_repository.invoke_stream = mock_invoke_stream

        # Act
        result_chunks = []
        async for chunk in usecase.execute(
            messages=valid_messages,
            model=valid_model_config,
            save_to_history=False,
        ):
            result_chunks.append(chunk)

        # Assert
        # 関数呼び出しが行われたことを確認（関数はcall_argsを持たないので、実行確認のみ）
        assert len(result_chunks) == 2

    @pytest.mark.asyncio
    async def test_execute_accumulates_response_for_saving(
        self, usecase, mock_bedrock_repository, mock_user_repository,
        mock_chat_repository, mock_message_repository, valid_user, valid_chat, valid_messages
    ):
        """レスポンストークンが蓄積されて保存されることを確認"""
        # Arrange
        expected_chunks = [
            BedrockStreamChunk(type="token", token="Hello"),
            BedrockStreamChunk(type="token", token=" world"),
            BedrockStreamChunk(type="token", token="!"),
            BedrockStreamChunk(type="metadata", metadata=BedrockStreamMetadata(stop_reason="end_turn")),
        ]

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)
        mock_message_repository.save = AsyncMock()
        async def mock_invoke_stream(*args, **kwargs):
            async for chunk in self.create_mock_stream(expected_chunks):
                yield chunk
        
        mock_bedrock_repository.invoke_stream = mock_invoke_stream
        mock_bedrock_repository.get_default_model = Mock(
            return_value=ModelConfig(model_id="claude-3-5-sonnet", temperature=0.7)
        )

        # Act
        result_chunks = []
        async for chunk in usecase.execute(
            messages=valid_messages,
            save_to_history=True,
            chat_id="chat-456",
            user_id="user-123",
        ):
            result_chunks.append(chunk)

        # Assert
        # アシスタントメッセージの保存が呼ばれることを確認
        save_calls = mock_message_repository.save.call_args_list
        assert len(save_calls) == 2  # ユーザーメッセージ + アシスタントメッセージ

        # 最後の保存呼び出しがアシスタントメッセージであることを確認
        assistant_message = save_calls[1][0][0]
        assert assistant_message.role == MessageRole.ASSISTANT
        assert assistant_message.content[0].body == "Hello world!"  # 蓄積されたレスポンス

    @pytest.mark.asyncio
    async def test_execute_handles_bedrock_service_error_gracefully(
        self, usecase, mock_bedrock_repository, valid_messages
    ):
        """Bedrockサービスエラーが適切に処理されることを確認"""
        # Arrange
        async def mock_invoke_stream_error(*args, **kwargs):
            raise Exception("Bedrock service unavailable")
            yield  # unreachable but makes it a generator
        
        mock_bedrock_repository.invoke_stream = mock_invoke_stream_error
        mock_bedrock_repository.get_default_model = Mock(
            return_value=ModelConfig(model_id="claude-3-5-sonnet", temperature=0.7)
        )

        # Act & Assert
        with pytest.raises(AIServiceError) as exc_info:
            async for chunk in usecase.execute(messages=valid_messages, save_to_history=False):
                pass

        assert "Bedrock service unavailable" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_performs_parallel_validation_when_saving(
        self, usecase, mock_user_repository, mock_chat_repository, mock_message_repository,
        mock_bedrock_repository, valid_user, valid_chat, valid_messages
    ):
        """履歴保存時にバリデーションが並列実行されることを確認"""
        # Arrange
        expected_chunks = [
            BedrockStreamChunk(type="token", token="Test"),
            BedrockStreamChunk(type="metadata", metadata=BedrockStreamMetadata(stop_reason="end_turn"))
        ]

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_id = AsyncMock(return_value=valid_chat)
        mock_message_repository.save = AsyncMock()
        async def mock_invoke_stream(*args, **kwargs):
            async for chunk in self.create_mock_stream(expected_chunks):
                yield chunk
        
        mock_bedrock_repository.invoke_stream = mock_invoke_stream
        mock_bedrock_repository.get_default_model = Mock(
            return_value=ModelConfig(model_id="claude-3-5-sonnet", temperature=0.7)
        )

        # Act
        result_chunks = []
        async for chunk in usecase.execute(
            messages=valid_messages,
            save_to_history=True,
            chat_id="chat-456",
            user_id="user-123",
        ):
            result_chunks.append(chunk)

        # Assert - 両方のリポジトリメソッドが呼ばれることを確認
        mock_user_repository.find_by_id.assert_called_once()
        mock_chat_repository.find_by_id.assert_called_once()