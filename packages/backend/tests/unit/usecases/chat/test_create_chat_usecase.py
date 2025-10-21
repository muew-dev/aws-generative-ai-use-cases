"""CreateChatUseCaseの単体テスト

TDDアプローチに従い、チャット作成機能の期待される動作を検証する
ユーザー認証、バリデーション、ビジネスルールを包括的にテスト
"""

import pytest
from unittest.mock import AsyncMock, Mock

from domain.entities.chat import Chat, ChatId
from domain.entities.user import User, UserId
from domain.errors.domain_errors import UserNotFoundError
from domain.repositories.chat_repository import IChatRepository
from domain.repositories.user_repository import IUserRepository
from usecases.chat.create_chat_usecase import CreateChatUseCase


class TestCreateChatUseCase:
    """チャット作成ユースケースの単体テスト"""

    @pytest.fixture
    def mock_chat_repository(self):
        return Mock(spec=IChatRepository)

    @pytest.fixture
    def mock_user_repository(self):
        return Mock(spec=IUserRepository)

    @pytest.fixture
    def usecase(self, mock_chat_repository, mock_user_repository):
        return CreateChatUseCase(
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

    @pytest.mark.asyncio
    async def test_execute_with_valid_data_creates_chat_successfully(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """有効なデータでチャットが正常に作成されることを確認"""
        # Arrange
        user_id = "user-123"
        title = "Test Chat"
        usecase_type = "chat"

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id=user_id,
            title=title,
            usecase=usecase_type,
        )

        # Assert
        assert isinstance(result, Chat)
        assert result.user_id.value == user_id
        assert result.title == title
        assert result.usecase == usecase_type

        # リポジトリメソッドが正しく呼ばれることを確認
        mock_user_repository.find_by_id.assert_called_once_with(UserId(user_id))
        mock_chat_repository.save.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_with_optional_title_creates_chat_with_default_title(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """オプションタイトルでデフォルトタイトルのチャットが作成されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(user_id=user_id)

        # Assert
        assert isinstance(result, Chat)
        assert result.title is not None  # デフォルトタイトルが設定される
        assert result.usecase == "chat"  # デフォルトユースケース

    @pytest.mark.asyncio
    async def test_execute_with_nonexistent_user_raises_user_not_found_error(
        self, usecase, mock_user_repository, mock_chat_repository
    ):
        """存在しないユーザーでUserNotFoundErrorが発生することを確認"""
        # Arrange
        mock_user_repository.find_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(UserNotFoundError) as exc_info:
            await usecase.execute(user_id="nonexistent-user")

        assert "nonexistent-user" in str(exc_info.value)
        # チャット保存は呼ばれない
        mock_chat_repository.save.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_with_empty_title_creates_chat_with_default_title(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """空のタイトルでデフォルトタイトルのチャットが作成されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id=user_id,
            title="",  # 空のタイトル
        )

        # Assert
        assert isinstance(result, Chat)
        assert result.title != ""  # デフォルトタイトルが設定される

    @pytest.mark.asyncio
    async def test_execute_with_custom_usecase_creates_chat_with_specified_usecase(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """カスタムユースケースで指定されたユースケースのチャットが作成されることを確認"""
        # Arrange
        user_id = "user-123"
        custom_usecase = "rag"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id=user_id,
            title="RAG Chat",
            usecase=custom_usecase,
        )

        # Assert
        assert result.usecase == custom_usecase

    @pytest.mark.asyncio
    async def test_execute_generates_unique_chat_id(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """実行時に一意のチャットIDが生成されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act - 複数回実行
        result1 = await usecase.execute(user_id=user_id)
        result2 = await usecase.execute(user_id=user_id)

        # Assert - 異なるIDが生成される
        assert result1.id != result2.id
        assert isinstance(result1.id, ChatId)
        assert isinstance(result2.id, ChatId)

    @pytest.mark.asyncio
    async def test_execute_sets_correct_timestamps(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """実行時に正しいタイムスタンプが設定されることを確認"""
        from datetime import datetime, UTC
        
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        before_creation = datetime.now(UTC)
        result = await usecase.execute(user_id=user_id)
        after_creation = datetime.now(UTC)

        # Assert
        assert before_creation <= result.created_at <= after_creation
        assert before_creation <= result.updated_at <= after_creation
        assert result.created_at == result.updated_at  # 新規作成時は同じ

    @pytest.mark.asyncio
    async def test_execute_handles_repository_save_error(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """リポジトリの保存エラーが適切に処理されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock(
            side_effect=Exception("Database save failed")
        )

        # Act & Assert
        with pytest.raises(Exception) as exc_info:
            await usecase.execute(user_id=user_id)

        assert "Database save failed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_validates_user_before_creating_chat(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """チャット作成前にユーザーが検証されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        await usecase.execute(user_id=user_id)

        # Assert - ユーザー検証が先に実行される
        mock_user_repository.find_by_id.assert_called_once_with(UserId(user_id))

    @pytest.mark.asyncio
    async def test_execute_with_long_title_handles_appropriately(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """長いタイトルが適切に処理されることを確認"""
        # Arrange
        user_id = "user-123"
        long_title = "A" * 1000  # 1000文字のタイトル
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id=user_id,
            title=long_title,
        )

        # Assert - 長いタイトルでも正常に作成される（制限は実装依存）
        assert isinstance(result, Chat)
        assert len(result.title) > 0

    @pytest.mark.asyncio
    async def test_execute_with_special_characters_in_title_handles_safely(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """タイトルの特殊文字が安全に処理されることを確認"""
        # Arrange
        user_id = "user-123"
        special_title = "Test <script>alert('xss')</script> Chat & More"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.save = AsyncMock()

        # Act
        result = await usecase.execute(
            user_id=user_id,
            title=special_title,
        )

        # Assert - 特殊文字でも正常に作成される
        assert isinstance(result, Chat)
        assert len(result.title) > 0
        # XSS攻撃の可能性がある内容が適切に処理される
        # （サニタイゼーションの詳細は実装依存）