"""Prisma Message Repository Implementation

Faithful Python translation of PrismaMessageRepository from unified-api-service
"""

from typing import Any

from infrastructure.prisma_client import PrismaClient
from models.chat import ChatId
from models.message import Message, MessageId
from models.user import UserId
from repositories.message_repository import IMessageRepository


class PrismaMessageRepository(IMessageRepository):
    """Prisma-based message repository implementation"""

    def __init__(self, prisma_client: PrismaClient):
        self.prisma = prisma_client

    async def save(self, message: Message) -> None:
        """Save a new message"""
        await self.prisma.client.message.create(
            data={
                "messageId": message.id.value,
                "chatId": message.chat_id.value,
                "userId": message.user_id.value,
                "role": message.role.value,
                "content": message.content[0].body,  # Simple text content
                "createdAt": message.created_at,
                "updatedAt": message.updated_at,
            }
        )

    async def find_by_id(
        self, user_id: UserId, message_id: MessageId
    ) -> Message | None:
        """Find message by ID for specific user"""
        message_data = await self.prisma.client.message.find_first(
            where={
                "messageId": message_id.value,
                "userId": user_id.value,
            }
        )

        if not message_data:
            return None

        return self._convert_to_domain_message(message_data)

    async def find_by_chat_id(
        self,
        user_id: UserId,
        chat_id: ChatId,
        offset: int | None = None,
        limit: int | None = None,
    ) -> list[Message]:
        """Find messages by chat ID for specific user with optional pagination"""
        query_params = {
            "where": {
                "chatId": chat_id.value,
                "userId": user_id.value,
            },
            "order": {"createdAt": "asc"},  # Chronological order
        }

        skip_value = offset if offset is not None else None
        take_value = limit if limit is not None else None

        message_data_list = await self.prisma.client.message.find_many(
            where=query_params["where"],  # type: ignore[arg-type]
            order=query_params["order"],  # type: ignore[arg-type]
            skip=skip_value,
            take=take_value,
        )

        return [
            self._convert_to_domain_message(message_data)
            for message_data in message_data_list
        ]

    async def update(self, message: Message) -> None:
        """Update an existing message"""
        await self.prisma.client.message.update(
            where={"messageId": message.id.value},
            data={
                "content": message.content[0].body,  # Simple text content
                "updatedAt": message.updated_at,
            },
        )

    async def delete(self, user_id: UserId, message_id: MessageId) -> bool:
        """Delete message by ID for specific user.

        Returns True if deleted, False if not found
        """
        try:
            await self.prisma.client.message.delete_many(
                where={
                    "messageId": message_id.value,
                    "userId": user_id.value,
                }
            )
            return True
        except Exception:
            # Message not found or other error
            return False

    async def count_by_chat_id(self, user_id: UserId, chat_id: ChatId) -> int:
        """Count total messages in a chat for a user"""
        return await self.prisma.client.message.count(
            where={
                "chatId": chat_id.value,
                "userId": user_id.value,
            }
        )

    def _convert_to_domain_message(self, message_data: Any) -> Message:
        """Convert Prisma message data to domain Message entity"""
        return Message.from_existing(
            message_id=message_data.messageId,
            chat_id=message_data.chatId,
            user_id=message_data.userId,
            role=message_data.role,
            content=message_data.content,  # Simple text content
            created_at=message_data.createdAt,
            updated_at=message_data.updatedAt,
        )
