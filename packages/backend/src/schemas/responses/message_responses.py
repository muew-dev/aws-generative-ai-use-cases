"""Message Response Models

Type-safe response models for message-related API responses.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.message import Message, MessageContent, ModelConfig


@dataclass(frozen=True)
class MessageContentResponse:
    """Type-safe message content response"""

    content_type: str
    body: str
    media_type: str | None = None

    @classmethod
    def from_domain(cls, content: "MessageContent") -> "MessageContentResponse":
        """Create from domain MessageContent"""
        return cls(
            content_type=content.content_type.value,
            body=content.body,
            media_type=content.media_type,
        )


@dataclass(frozen=True)
class ModelConfigResponse:
    """Type-safe model configuration response"""

    model_id: str
    temperature: float | None = None
    max_tokens: int | None = None
    top_p: float | None = None
    stop_sequences: list[str] | None = None

    @classmethod
    def from_domain(cls, model: "ModelConfig") -> "ModelConfigResponse":
        """Create from domain ModelConfig"""
        return cls(
            model_id=model.model_id,
            temperature=model.temperature,
            max_tokens=model.max_tokens,
            top_p=model.top_p,
            stop_sequences=model.stop_sequences,
        )

    @classmethod
    def from_domain_optional(
        cls, model: "ModelConfig | None"
    ) -> "ModelConfigResponse | None":
        """Create from optional domain ModelConfig"""
        if not model:
            return None
        return cls.from_domain(model)


@dataclass(frozen=True)
class MessageResponse:
    """Type-safe message response"""

    id: str
    chat_id: str
    user_id: str
    role: str
    content: list[MessageContentResponse]
    model: ModelConfigResponse | None = None
    created_at: str | None = None
    updated_at: str | None = None

    @classmethod
    def from_domain(cls, message: "Message") -> "MessageResponse":
        """Create from domain Message"""
        return cls(
            id=message.id.value,
            chat_id=message.chat_id.value,
            user_id=message.user_id.value,
            role=message.role.value,
            content=[MessageContentResponse.from_domain(c) for c in message.content],
            model=ModelConfigResponse.from_domain_optional(message.model),
            created_at=message.created_at.isoformat() if message.created_at else None,
            updated_at=message.updated_at.isoformat() if message.updated_at else None,
        )


# Backward compatibility alias
MessageData = MessageResponse
