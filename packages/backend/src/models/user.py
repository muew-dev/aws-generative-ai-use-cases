"""User Domain Entity

Faithful Python translation of TypeScript User entity from unified-api-service
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class UserId:
    """User ID Value Object"""

    value: str

    def __post_init__(self) -> None:
        """Validate User ID"""
        if not self.value or not self.value.strip():
            raise ValueError("User ID cannot be empty")

        if len(self.value) > 255:
            raise ValueError("User ID cannot exceed 255 characters")

    def __str__(self) -> str:
        return self.value

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, UserId):
            return False
        return self.value == other.value


@dataclass
class User:
    """User Domain Entity"""

    id: UserId
    email: str | None
    display_name: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(
        cls, user_id: str, email: str | None = None, display_name: str | None = None
    ) -> "User":
        """Factory method to create a new User"""
        now = datetime.utcnow()

        return cls(
            id=UserId(user_id),
            email=email,
            display_name=display_name,
            created_at=now,
            updated_at=now,
        )

    @classmethod
    def from_existing(
        cls,
        user_id: str,
        email: str | None,
        display_name: str | None,
        created_at: datetime,
        updated_at: datetime,
    ) -> "User":
        """Factory method to create User from existing data"""
        return cls(
            id=UserId(user_id),
            email=email,
            display_name=display_name,
            created_at=created_at,
            updated_at=updated_at,
        )

    def update_display_name(self, new_display_name: str | None) -> "User":
        """Update display name with business rules"""
        if new_display_name is not None and len(new_display_name) > 255:
            raise ValueError("Display name cannot exceed 255 characters")

        return User(
            id=self.id,
            email=self.email,
            display_name=new_display_name,
            created_at=self.created_at,
            updated_at=datetime.utcnow(),
        )

    def to_dict(self) -> dict:
        """Convert to dictionary for API responses"""
        return {
            "userId": self.id.value,
            "email": self.email,
            "displayName": self.display_name,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }
