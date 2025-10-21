"""Prisma Chat Repository Implementation

Faithful Python translation of PrismaChatRepository from unified-api-service
"""

from infrastructure.prisma_client import PrismaClient
from models.chat import Chat, ChatId
from models.user import UserId
from repositories.chat_repository import IChatRepository


class PrismaChatRepository(IChatRepository):
    """Prisma-based chat repository implementation"""

    def __init__(self, prisma_client: PrismaClient):
        self.prisma = prisma_client

    async def save(self, chat: Chat) -> None:
        """Save a new chat"""
        await self.prisma.client.chat.create(
            data={
                "chatId": chat.id.value,
                "userId": chat.user_id.value,
                "title": chat.title,
                "usecase": chat.usecase,
                "createdAt": chat.created_at,
                "updatedAt": chat.updated_at,
            }
        )

    async def find_by_id(self, user_id: UserId, chat_id: ChatId) -> Chat | None:
        """Find chat by ID for specific user"""
        chat_data = await self.prisma.client.chat.find_first(
            where={
                "chatId": chat_id.value,
                "userId": user_id.value,
            }
        )

        if not chat_data:
            return None

        return Chat.from_existing(
            chat_id=chat_data.chatId,
            user_id=chat_data.userId,
            title=chat_data.title,
            usecase=chat_data.usecase,
            created_at=chat_data.createdAt,
            updated_at=chat_data.updatedAt,
        )

    async def find_by_user_id(
        self, user_id: UserId, offset: int | None = None, limit: int | None = None
    ) -> list[Chat]:
        """Find chats by user ID with optional pagination"""
        chat_data_list = await self.prisma.client.chat.find_many(
            where={"userId": user_id.value},
            order={"updatedAt": "desc"},  # Most recently updated first
            skip=offset,
            take=limit,
        )

        return [
            Chat.from_existing(
                chat_id=chat_data.chatId,
                user_id=chat_data.userId,
                title=chat_data.title,
                usecase=chat_data.usecase,
                created_at=chat_data.createdAt,
                updated_at=chat_data.updatedAt,
            )
            for chat_data in chat_data_list
        ]

    async def update(self, chat: Chat) -> None:
        """Update an existing chat"""
        await self.prisma.client.chat.update(
            where={"chatId": chat.id.value},
            data={
                "title": chat.title,
                "usecase": chat.usecase,
                "updatedAt": chat.updated_at,
            },
        )

    async def delete(self, user_id: UserId, chat_id: ChatId) -> bool:
        """Delete chat by ID for specific user.

        Returns True if deleted, False if not found
        """
        try:
            await self.prisma.client.chat.delete_many(
                where={
                    "chatId": chat_id.value,
                    "userId": user_id.value,
                }
            )
            return True
        except Exception:
            # Chat not found or other error
            return False

    async def count_by_user_id(self, user_id: UserId) -> int:
        """Count total chats for a user"""
        return await self.prisma.client.chat.count(where={"userId": user_id.value})
