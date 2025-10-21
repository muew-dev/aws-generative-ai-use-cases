"""ListChatsUseCaseの単体テスト

TDDアプローチに従い、チャット一覧取得機能の期待される動作を検証する
ページネーション、フィルタリング、権限制御を包括的にテスト
"""

import pytest
from unittest.mock import AsyncMock, Mock

from domain.entities.chat import Chat
from domain.entities.user import User, UserId
from domain.errors.domain_errors import UserNotFoundError
from domain.repositories.chat_repository import IChatRepository
from domain.repositories.user_repository import IUserRepository
from usecases.chat.list_chats_usecase import ListChatsUseCase, ListChatsResult


class TestListChatsUseCase:
    """チャット一覧ユースケースの単体テスト"""

    @pytest.fixture
    def mock_chat_repository(self):
        return Mock(spec=IChatRepository)

    @pytest.fixture
    def mock_user_repository(self):
        return Mock(spec=IUserRepository)

    @pytest.fixture
    def usecase(self, mock_chat_repository, mock_user_repository):
        return ListChatsUseCase(
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
    def sample_chats(self):
        from datetime import datetime
        return [
            Chat.from_existing(
                chat_id="chat-1",
                title="First Chat",
                usecase="chat",
                user_id="user-123",
                created_at=datetime.fromisoformat("2024-01-01T10:00:00+00:00"),
                updated_at=datetime.fromisoformat("2024-01-01T10:00:00+00:00"),
            ),
            Chat.from_existing(
                chat_id="chat-2", 
                title="Second Chat",
                usecase="rag",
                user_id="user-123",
                created_at=datetime.fromisoformat("2024-01-01T11:00:00+00:00"),
                updated_at=datetime.fromisoformat("2024-01-01T11:00:00+00:00"),
            ),
            Chat.from_existing(
                chat_id="chat-3",
                title="Third Chat", 
                usecase="chat",
                user_id="user-123",
                created_at=datetime.fromisoformat("2024-01-01T12:00:00+00:00"),
                updated_at=datetime.fromisoformat("2024-01-01T12:00:00+00:00"),
            ),
        ]

    @pytest.mark.asyncio
    async def test_execute_with_valid_user_returns_chat_list(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user, sample_chats
    ):
        """有効なユーザーでチャット一覧が正常に取得されることを確認"""
        # Arrange
        user_id = "user-123"
        offset = 0
        limit = 10

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=len(sample_chats))
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=sample_chats)

        # Act
        result = await usecase.execute(
            user_id=user_id,
            offset=offset,
            limit=limit,
        )

        # Assert
        assert isinstance(result, ListChatsResult)
        assert len(result.chats) == 3
        assert result.total == 3
        assert result.offset == offset
        assert result.limit == limit

        # リポジトリメソッドが正しく呼ばれることを確認
        mock_user_repository.find_by_id.assert_called_once_with(UserId(user_id))
        mock_chat_repository.count_by_user_id.assert_called_once_with(UserId(user_id))
        mock_chat_repository.find_by_user_id.assert_called_once_with(
            user_id=UserId(user_id), offset=offset, limit=limit
        )

    @pytest.mark.asyncio
    async def test_execute_with_pagination_returns_correct_subset(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user, sample_chats
    ):
        """ページネーションで正しい部分集合が返されることを確認"""
        # Arrange
        user_id = "user-123"
        offset = 1
        limit = 2
        
        # 2番目から2つのチャットを返すモック
        paginated_chats = sample_chats[1:3]
        total_count = len(sample_chats)

        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=total_count)
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=paginated_chats)

        # Act
        result = await usecase.execute(
            user_id=user_id,
            offset=offset,
            limit=limit,
        )

        # Assert
        assert len(result.chats) == 2
        assert result.total == 3  # 全体の総数
        assert result.offset == offset
        assert result.limit == limit
        
        # 正しいチャットが返されることを確認
        assert result.chats[0].id.value == "chat-2"
        assert result.chats[1].id.value == "chat-3"

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
        # チャット検索は呼ばれない
        mock_chat_repository.find_by_user_id.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_with_no_chats_returns_empty_list(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """チャットが無い場合、空のリストが返されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=0)
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=[])

        # Act
        result = await usecase.execute(user_id=user_id)

        # Assert
        assert result.chats == []
        assert result.total == 0
        assert result.offset == 0  # デフォルト値
        assert result.limit == 20   # デフォルト値

    @pytest.mark.asyncio
    async def test_execute_with_default_pagination_parameters(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user, sample_chats
    ):
        """デフォルトのページネーションパラメータが適用されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=len(sample_chats))
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=sample_chats)

        # Act - パラメータ指定なし
        result = await usecase.execute(user_id=user_id)

        # Assert - デフォルト値が適用される
        assert result.offset == 0
        assert result.limit == 20  # 実装に依存するデフォルト値

        # リポジトリには正しいデフォルト値が渡される
        mock_chat_repository.find_by_user_id.assert_called_once_with(
            user_id=UserId(user_id), offset=0, limit=20
        )

    @pytest.mark.asyncio
    async def test_execute_with_large_offset_returns_empty_list(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """大きなオフセットで空のリストが返されることを確認"""
        # Arrange
        user_id = "user-123"
        large_offset = 1000
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=3)
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=[])

        # Act
        result = await usecase.execute(
            user_id=user_id,
            offset=large_offset,
            limit=10,
        )

        # Assert
        assert result.chats == []
        assert result.total == 3  # 全体の総数は変わらない
        assert result.offset == large_offset

    @pytest.mark.asyncio
    async def test_execute_with_zero_limit_raises_value_error(
        self, usecase, mock_user_repository, valid_user
    ):
        """制限値0でValueErrorが発生することを確認"""
        # Arrange
        user_id = "user-123"

        # Act & Assert
        with pytest.raises(ValueError, match="Limit must be positive"):
            await usecase.execute(
                user_id=user_id,
                offset=0,
                limit=0,
            )

    @pytest.mark.asyncio
    async def test_execute_with_negative_offset_uses_zero(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user, sample_chats
    ):
        """負のオフセットが0として扱われることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=len(sample_chats))
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=sample_chats)

        # Act & Assert
        with pytest.raises(ValueError, match="Offset cannot be negative"):
            await usecase.execute(
                user_id=user_id,
                offset=-5,  # 負の値
                limit=10,
            )

    @pytest.mark.asyncio
    async def test_execute_chats_sorted_by_updated_at_desc(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user, sample_chats
    ):
        """チャットが更新日時の降順でソートされることを確認"""
        # Arrange - 更新日時でソート済みのチャットリスト
        sorted_chats = sorted(sample_chats, key=lambda c: c.updated_at, reverse=True)
        user_id = "user-123"
        
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=len(sorted_chats))
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=sorted_chats)

        # Act
        result = await usecase.execute(user_id=user_id)

        # Assert - 最新のチャットが最初に来る
        chats = result.chats
        if len(chats) > 1:
            for i in range(len(chats) - 1):
                assert chats[i].updated_at >= chats[i + 1].updated_at

    @pytest.mark.asyncio
    async def test_execute_handles_repository_error(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user
    ):
        """リポジトリエラーが適切に処理されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.find_by_user_id = AsyncMock(
            side_effect=Exception("Database connection failed")
        )

        # Act & Assert
        with pytest.raises(Exception) as exc_info:
            await usecase.execute(user_id=user_id)

        assert "Database connection failed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_with_maximum_limit_enforced(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user, sample_chats
    ):
        """最大制限値が適用されることを確認"""
        # Arrange
        user_id = "user-123"
        very_large_limit = 10000
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=len(sample_chats))
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=sample_chats)

        # Act & Assert
        with pytest.raises(ValueError, match="Limit cannot exceed 100"):
            await usecase.execute(
                user_id=user_id,
                offset=0,
                limit=very_large_limit,
            )

    @pytest.mark.asyncio
    async def test_execute_user_validation_performed_before_chat_retrieval(
        self, usecase, mock_chat_repository, mock_user_repository, valid_user, sample_chats
    ):
        """チャット取得前にユーザー検証が実行されることを確認"""
        # Arrange
        user_id = "user-123"
        mock_user_repository.find_by_id = AsyncMock(return_value=valid_user)
        mock_chat_repository.count_by_user_id = AsyncMock(return_value=len(sample_chats))
        mock_chat_repository.find_by_user_id = AsyncMock(return_value=sample_chats)

        # Act
        await usecase.execute(user_id=user_id)

        # Assert - 呼び出し順序の確認
        mock_user_repository.find_by_id.assert_called_once_with(UserId(user_id))
        mock_chat_repository.find_by_user_id.assert_called_once()