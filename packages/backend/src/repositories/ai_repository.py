"""AI Repository Abstract Interface

Defines abstract interfaces for AI service integrations.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from models.message import ModelConfig


@dataclass(frozen=True)
class StreamChunk:
    """Generic streaming chunk from AI services"""

    type: str  # "token", "metadata", "error"
    token: str | None = None
    metadata: dict[str, Any] | None = None
    error: str | None = None


class IAIRepository(ABC):
    """Abstract interface for AI service repositories"""

    @abstractmethod
    def invoke_stream(
        self,
        model_config: ModelConfig,
        messages: Any,  # AI service specific message format
        system_prompt: str | None = None,
    ) -> AsyncGenerator[StreamChunk]:
        """Stream AI model response"""
        pass

    @abstractmethod
    async def invoke(
        self,
        model_config: ModelConfig,
        messages: Any,  # AI service specific message format
        system_prompt: str | None = None,
    ) -> str:
        """Get complete AI model response"""
        pass

    @abstractmethod
    def get_default_model(self) -> ModelConfig:
        """Get default model configuration"""
        pass
