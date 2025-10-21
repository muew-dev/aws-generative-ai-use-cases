"""Message Repository Interface

Faithful Python translation of IMessageRepository from unified-api-service
"""

from abc import ABC, abstractmethod

from models.chat import ChatId
from models.message import Message, MessageId
from models.user import UserId


class IMessageRepository(ABC):
    """Message repository interface defining data access operations"""

    @abstractmethod
    async def save(self, message: Message) -> None:
        """Save a new message"""
        pass

    @abstractmethod
    async def find_by_id(
        self, user_id: UserId, message_id: MessageId
    ) -> Message | None:
        """Find message by ID for specific user"""
        pass

    @abstractmethod
    async def find_by_chat_id(
        self,
        user_id: UserId,
        chat_id: ChatId,
        offset: int | None = None,
        limit: int | None = None,
    ) -> list[Message]:
        """Find messages by chat ID for specific user with optional pagination"""
        pass

    @abstractmethod
    async def update(self, message: Message) -> None:
        """Update an existing message"""
        pass

    @abstractmethod
    async def delete(self, user_id: UserId, message_id: MessageId) -> bool:
        """Delete message by ID for specific user.

        Returns True if deleted, False if not found
        """
        pass

    @abstractmethod
    async def count_by_chat_id(self, user_id: UserId, chat_id: ChatId) -> int:
        """Count total messages in a chat for a user"""
        pass
