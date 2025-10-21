"""Bedrock Infrastructure Models

Bedrock-specific implementations of AI service models.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from infrastructure.bedrock_types import BedrockContentDict, BedrockMessageDict
from models.ai_models import AIMessage, AIMessageList, AIStreamMetadata


@dataclass(frozen=True)
class BedrockMessage(AIMessage):
    """Bedrock-specific message model"""

    def to_provider_format(self) -> BedrockMessageDict:
        """Convert to type-safe Bedrock API format"""

        content_list = []
        for content in self.content:
            content_dict: BedrockContentDict = {
                "type": content.content_type.value,
                "text": content.body,
            }
            if content.media_type:
                content_dict["media_type"] = content.media_type
            content_list.append(content_dict)

        return BedrockMessageDict(role=self.role, content=content_list)

    # Backward compatibility
    def to_bedrock_format(self) -> BedrockMessageDict:
        """Convert to type-safe Bedrock API format (backward compatibility)"""
        return self.to_provider_format()


@dataclass(frozen=True)
class BedrockMessageList(AIMessageList):
    """Bedrock-specific collection of messages"""

    messages: Sequence[BedrockMessage]

    def to_provider_format(self) -> list[BedrockMessageDict]:
        """Convert all messages to type-safe Bedrock API format"""
        return [msg.to_provider_format() for msg in self.messages]

    # Backward compatibility
    def to_bedrock_format(self) -> list[BedrockMessageDict]:
        """Convert all messages to type-safe Bedrock API format (backward compatibility)"""
        return self.to_provider_format()

    @classmethod
    def from_domain_messages(cls, messages: list[Any]) -> "BedrockMessageList":
        """Create from validated domain messages"""
        bedrock_messages = []
        for msg in messages:
            bedrock_messages.append(
                BedrockMessage(
                    role=msg["role"],
                    content=msg["content"],  # Already MessageContent objects
                )
            )
        return cls(messages=bedrock_messages)


@dataclass(frozen=True)
class BedrockStreamMetadata(AIStreamMetadata):
    """Bedrock-specific streaming response metadata"""

    pass  # Uses parent class implementation
