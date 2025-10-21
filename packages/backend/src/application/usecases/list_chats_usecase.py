"""List Chats Use Case

Simplified use case that directly queries chats via Prisma
"""

import asyncio
from dataclasses import dataclass
from typing import Any

from infrastructure.prisma_client import PrismaClient
from models.domain_errors import DomainErrors
from models.user import UserId
from repositories.user_repository import IUserRepository


@dataclass
class ListChatsResult:
    """Result data for list chats operation"""

    chats: list[Any]  # Prisma chat data
    total: int
    offset: int
    limit: int


class ListChatsUseCase:
    """Use case for listing user's chats with pagination"""

    def __init__(
        self, prisma_client: PrismaClient, user_repository: IUserRepository
    ):
        self.prisma = prisma_client
        self.user_repository = user_repository

    async def execute(
        self, user_id: str, offset: int | None = None, limit: int | None = None
    ) -> ListChatsResult:
        """Execute list chats use case

        Args:
            user_id: User ID to list chats for
            offset: Number of chats to skip (default: 0)
            limit: Maximum number of chats to return (default: 20, max: 100)

        Returns:
            ListChatsResult with Prisma chat data and pagination info

        Raises:
            DomainError: If user does not exist or other domain error occurs
            ValueError: If limit exceeds maximum allowed (100)
        """
        user_id_obj = UserId(user_id)

        # Set default pagination values
        offset = offset if offset is not None else 0
        limit = limit if limit is not None else 20

        # Validate limit
        if limit > 100:
            raise ValueError("Limit cannot exceed 100")

        # Validate pagination parameters
        if offset < 0:
            raise ValueError("Offset cannot be negative")

        if limit < 1:
            raise ValueError("Limit must be positive")

        # Execute user existence check and chat count in parallel
        user_task = self.user_repository.find_by_id(user_id_obj)
        count_task = self.prisma.client.chat.count(where={"userId": user_id})

        user, total = await asyncio.gather(user_task, count_task)

        # Validate user exists
        if not user:
            raise DomainErrors.user_not_found(user_id)

        # Get chats with pagination directly from Prisma
        chats = await self.prisma.client.chat.find_many(
            where={"userId": user_id},
            order={"updatedAt": "desc"},  # Most recently updated first
            skip=offset,
            take=limit,
        )

        return ListChatsResult(chats=chats, total=total, offset=offset, limit=limit)
