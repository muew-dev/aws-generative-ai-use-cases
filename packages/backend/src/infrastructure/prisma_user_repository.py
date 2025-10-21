"""Prisma User Repository Implementation

Faithful Python translation of PrismaUserRepository from unified-api-service
"""

from infrastructure.prisma_client import PrismaClient
from models.user import User, UserId
from repositories.user_repository import IUserRepository


class PrismaUserRepository(IUserRepository):
    """Prisma-based user repository implementation"""

    def __init__(self, prisma_client: PrismaClient):
        self.prisma = prisma_client

    async def save(self, user: User) -> None:
        """Save a new user"""
        await self.prisma.client.user.create(
            data={
                "userId": user.id.value,
                "email": user.email,
                "displayName": user.display_name,
                "createdAt": user.created_at,
                "updatedAt": user.updated_at,
            }
        )

    async def find_by_id(self, user_id: UserId) -> User | None:
        """Find user by ID"""
        user_data = await self.prisma.client.user.find_unique(
            where={"userId": user_id.value}
        )

        if not user_data:
            return None

        return User.from_existing(
            user_id=user_data.userId,
            email=user_data.email,
            display_name=user_data.displayName,
            created_at=user_data.createdAt,
            updated_at=user_data.updatedAt,
        )

    async def find_by_email(self, email: str) -> User | None:
        """Find user by email address"""
        user_data = await self.prisma.client.user.find_first(where={"email": email})

        if not user_data:
            return None

        return User.from_existing(
            user_id=user_data.userId,
            email=user_data.email,
            display_name=user_data.displayName,
            created_at=user_data.createdAt,
            updated_at=user_data.updatedAt,
        )

    async def update(self, user: User) -> None:
        """Update an existing user"""
        await self.prisma.client.user.update(
            where={"userId": user.id.value},
            data={
                "email": user.email,
                "displayName": user.display_name,
                "updatedAt": user.updated_at,
            },
        )

    async def delete(self, user_id: UserId) -> bool:
        """Delete user by ID. Returns True if deleted, False if not found"""
        try:
            await self.prisma.client.user.delete(where={"userId": user_id.value})
            return True
        except Exception:
            # User not found or other error
            return False

    async def exists(self, user_id: UserId) -> bool:
        """Check if user exists by ID"""
        user_data = await self.prisma.client.user.find_unique(
            where={"userId": user_id.value}
        )

        return user_data is not None
