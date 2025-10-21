"""Chat Response Models

Type-safe response models for chat-related API responses.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Chat:
    """Type-safe chat response"""

    id: str
    user_id: str
    title: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    @classmethod
    def from_prisma(cls, chat_data: Any) -> "Chat":
        """Create from Prisma chat data"""
        return cls(
            id=str(chat_data.chatId),
            user_id=str(chat_data.userId),
            title=chat_data.title,
            created_at=chat_data.createdAt.isoformat() if chat_data.createdAt else None,
            updated_at=chat_data.updatedAt.isoformat() if chat_data.updatedAt else None,
        )


@dataclass(frozen=True)
class ChatList:
    """Chat list data response"""

    chats: list[Chat]

    @classmethod
    def from_domain(cls, chats: Any) -> "ChatList":
        """Create from domain chat list"""
        return cls(chats=[Chat.from_prisma(chat) for chat in chats.chats])

    @classmethod
    def from_prisma_list(cls, chat_data_list: list[Any]) -> "ChatList":
        """Create from Prisma chat data list"""
        return cls(chats=[Chat.from_prisma(chat_data) for chat_data in chat_data_list])
