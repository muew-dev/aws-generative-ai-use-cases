"""User Repository Interface

Faithful Python translation of IUserRepository from unified-api-service
"""

from abc import ABC, abstractmethod

from models.user import User, UserId


class IUserRepository(ABC):
    """User repository interface defining data access operations"""

    @abstractmethod
    async def save(self, user: User) -> None:
        """Save a new user"""
        pass

    @abstractmethod
    async def find_by_id(self, user_id: UserId) -> User | None:
        """Find user by ID"""
        pass

    @abstractmethod
    async def find_by_email(self, email: str) -> User | None:
        """Find user by email address"""
        pass

    @abstractmethod
    async def update(self, user: User) -> None:
        """Update an existing user"""
        pass

    @abstractmethod
    async def delete(self, user_id: UserId) -> bool:
        """Delete user by ID. Returns True if deleted, False if not found"""
        pass

    @abstractmethod
    async def exists(self, user_id: UserId) -> bool:
        """Check if user exists by ID"""
        pass
