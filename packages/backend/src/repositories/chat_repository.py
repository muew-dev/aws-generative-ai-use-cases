"""Chat Repository Interface

Faithful Python translation of IChatRepository from unified-api-service
"""

from abc import ABC, abstractmethod

from models.chat import Chat, ChatId
from models.user import UserId


class IChatRepository(ABC):
    """Chat repository interface defining data access operations"""

    @abstractmethod
    async def save(self, chat: Chat) -> None:
        """Save a new chat"""
        pass

    @abstractmethod
    async def find_by_id(self, user_id: UserId, chat_id: ChatId) -> Chat | None:
        """Find chat by ID for specific user"""
        pass

    @abstractmethod
    async def find_by_user_id(
        self, user_id: UserId, offset: int | None = None, limit: int | None = None
    ) -> list[Chat]:
        """Find chats by user ID with optional pagination"""
        pass

    @abstractmethod
    async def update(self, chat: Chat) -> None:
        """Update an existing chat"""
        pass

    @abstractmethod
    async def delete(self, user_id: UserId, chat_id: ChatId) -> bool:
        """Delete chat by ID for specific user.

        Returns True if deleted, False if not found
        """
        pass

    @abstractmethod
    async def count_by_user_id(self, user_id: UserId) -> int:
        """Count total chats for a user"""
        pass
