"""Repository Interfaces

Abstract interfaces for data access that domain layer expects.
"""

from .ai_repository import (
    IAIRepository as IBedrockRepository,
)
from .ai_repository import (
    StreamChunk as BedrockStreamChunk,
)
from .chat_repository import IChatRepository
from .message_repository import IMessageRepository
from .user_repository import IUserRepository

__all__ = [
    "BedrockStreamChunk",
    "IBedrockRepository",
    "IChatRepository",
    "IMessageRepository",
    "IUserRepository",
]
