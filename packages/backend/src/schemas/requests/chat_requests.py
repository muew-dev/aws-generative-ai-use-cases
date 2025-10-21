"""Chat Request Models

Type-safe request models for chat-related API endpoints.
"""

from pydantic import BaseModel, Field

# ============================================================================
# Chat Request Models
# ============================================================================


class CreateChatRequest(BaseModel):
    """Request model for creating a chat"""

    title: str | None = Field(None, max_length=500, description="Chat title")
