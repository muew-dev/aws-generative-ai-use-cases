"""Message Domain Entity

Faithful Python translation of TypeScript Message entity from unified-api-service
"""

import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

from models.chat import ChatId
from models.user import UserId

if TYPE_CHECKING:
    from models.response_models import MessageResponse, ModelConfigResponse


class MessageRole(Enum):
    """Message Role Enumeration"""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ContentType(Enum):
    """Message Content Type Enumeration"""

    TEXT = "text"
    IMAGE = "image"
    DOCUMENT = "document"


@dataclass(frozen=True)
class MessageId:
    """Message ID Value Object"""

    value: str

    @classmethod
    def generate(cls) -> "MessageId":
        """Generate a unique Message ID with timestamp + random"""
        timestamp = int(time.time() * 1000)  # milliseconds
        random_part = secrets.token_hex(4)  # 8 character hex string
        message_id = f"msg_{timestamp}_{random_part}"
        return cls(message_id)

    def __post_init__(self) -> None:
        """Validate Message ID"""
        if not self.value or not self.value.strip():
            raise ValueError("Message ID cannot be empty")

    def __str__(self) -> str:
        return self.value

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, MessageId):
            return False
        return self.value == other.value


@dataclass(frozen=True)
class MessageContent:
    """Message Content Value Object"""

    content_type: ContentType
    body: str
    media_type: str | None = None

    def __post_init__(self) -> None:
        """Validate Message Content"""
        if not self.body:
            raise ValueError("Content body cannot be empty")

        if self.content_type == ContentType.TEXT and self.media_type is None:
            object.__setattr__(self, "media_type", "text/plain")

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return {
            "contentType": self.content_type.value,
            "body": self.body,
            "mediaType": self.media_type,
        }


@dataclass(frozen=True)
class ModelConfig:
    """AI Model Configuration Value Object"""

    model_id: str
    temperature: float | None = 0.7
    max_tokens: int | None = 4096
    top_p: float | None = 0.9
    stop_sequences: list[str] | None = None

    def __post_init__(self) -> None:
        """Validate Model Configuration"""
        if not self.model_id:
            raise ValueError("Model ID cannot be empty")

        if self.temperature is not None:
            if not 0.0 <= self.temperature <= 1.0:
                raise ValueError("Temperature must be between 0.0 and 1.0")

        if self.max_tokens is not None:
            if self.max_tokens <= 0:
                raise ValueError("Max tokens must be positive")

        if self.top_p is not None:
            if not 0.0 <= self.top_p <= 1.0:
                raise ValueError("Top P must be between 0.0 and 1.0")

    def to_response(self) -> "ModelConfigResponse":
        """Convert to type-safe response model"""
        from models.response_models import ModelConfigResponse

        result = ModelConfigResponse.from_domain(self)
        if result is None:
            raise ValueError("ModelConfig cannot be None")
        return result


@dataclass(frozen=True)
class MessageFeedback:
    """Message Feedback Value Object"""

    is_good: bool
    comment: str | None
    created_at: datetime

    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "isGood": self.is_good,
            "comment": self.comment,
            "createdAt": self.created_at.isoformat(),
        }


@dataclass
class Message:
    """Message Domain Entity"""

    id: MessageId
    chat_id: ChatId
    user_id: UserId
    role: MessageRole
    content: list[MessageContent]
    created_at: datetime
    updated_at: datetime
    model: ModelConfig | None = None
    feedback: MessageFeedback | None = None

    @classmethod
    def create(
        cls,
        chat_id: ChatId,
        user_id: UserId,
        role: MessageRole,
        content: list[MessageContent],
        model: ModelConfig | None = None,
    ) -> "Message":
        """Factory method to create a new Message"""
        if not content:
            raise ValueError("Message content cannot be empty")

        now = datetime.now(UTC)

        return cls(
            id=MessageId.generate(),
            chat_id=chat_id,
            user_id=user_id,
            role=role,
            content=content,
            model=model,
            created_at=now,
            updated_at=now,
        )

    @classmethod
    def from_existing(
        cls,
        message_id: str,
        chat_id: str,
        user_id: str,
        role: str,
        content: list[dict],
        model: dict | None = None,
        feedback: dict | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ) -> "Message":
        """Factory method to create Message from existing data"""

        # Convert content list
        content_objects = []
        for c in content:
            content_objects.append(
                MessageContent(
                    content_type=ContentType(c["contentType"]),
                    body=c["body"],
                    media_type=c.get("mediaType"),
                )
            )

        # Convert model config
        model_obj = None
        if model:
            model_obj = ModelConfig(
                model_id=model["modelId"],
                temperature=model.get("temperature"),
                max_tokens=model.get("maxTokens"),
                top_p=model.get("topP"),
                stop_sequences=model.get("stopSequences"),
            )

        # Convert feedback
        feedback_obj = None
        if feedback:
            feedback_obj = MessageFeedback(
                is_good=feedback["isGood"],
                comment=feedback.get("comment"),
                created_at=datetime.fromisoformat(
                    feedback["createdAt"].replace("Z", "+00:00")
                ),
            )

        return cls(
            id=MessageId(message_id),
            chat_id=ChatId(chat_id),
            user_id=UserId(user_id),
            role=MessageRole(role),
            content=content_objects,
            model=model_obj,
            feedback=feedback_obj,
            created_at=created_at or datetime.now(UTC),
            updated_at=updated_at or datetime.now(UTC),
        )

    def add_feedback(self, is_good: bool, comment: str | None = None) -> "Message":
        """Add feedback to the message"""
        feedback = MessageFeedback(
            is_good=is_good, comment=comment, created_at=datetime.now(UTC)
        )

        return Message(
            id=self.id,
            chat_id=self.chat_id,
            user_id=self.user_id,
            role=self.role,
            content=self.content,
            model=self.model,
            feedback=feedback,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
        )

    def get_text_content(self) -> str:
        """Get combined text content from all text content blocks"""
        text_parts = []
        for content_item in self.content:
            if content_item.content_type == ContentType.TEXT:
                text_parts.append(content_item.body)
        return " ".join(text_parts)

    def has_images(self) -> bool:
        """Check if message contains image content"""
        return any(
            content_item.content_type == ContentType.IMAGE
            for content_item in self.content
        )

    def to_response(self) -> "MessageResponse":
        """Convert to type-safe response model"""
        from models.response_models import MessageResponse

        return MessageResponse.from_domain(self)
