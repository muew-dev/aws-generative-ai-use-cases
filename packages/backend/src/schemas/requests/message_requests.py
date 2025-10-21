"""Request Models

Type-safe request models for API endpoints with proper validation.
"""

from pydantic import BaseModel, Field

# ============================================================================
# Message Request Models
# ============================================================================


class MessageContentModel(BaseModel):
    """Message content model"""

    contentType: str = Field(..., description="Content type (text, image, etc.)")
    body: str = Field(..., description="Content body")
    mediaType: str | None = Field(None, description="Media type for content")


class ModelConfigModel(BaseModel):
    """Model configuration model"""

    modelId: str | None = Field(None, description="Model identifier")
    temperature: float | None = Field(
        None, ge=0.0, le=2.0, description="Sampling temperature"
    )
    maxTokens: int | None = Field(None, ge=1, description="Maximum tokens to generate")
    topP: float | None = Field(
        None, ge=0.0, le=1.0, description="Top-p sampling parameter"
    )
    stopSequences: list[str] | None = Field(None, description="Stop sequences")


class StreamMessageModel(BaseModel):
    """Stream message model"""

    role: str = Field(..., description="Message role (user, assistant, system)")
    content: list[MessageContentModel] = Field(..., description="Message content list")


class CreateMessageRequest(BaseModel):
    """Request model for creating a message"""

    role: str = Field(..., pattern="^(user|assistant)$", description="Message role")
    content: list[MessageContentModel] = Field(..., description="Message content list")
    model: ModelConfigModel | None = Field(None, description="Model configuration")
    systemPrompt: str | None = Field(None, description="System prompt")


class StreamRequestModel(BaseModel):
    """Stream request model"""

    messages: list[StreamMessageModel] = Field(..., description="Message list")
    system_prompt: str | None = Field(None, description="System prompt")
    systemPrompt: str | None = Field(None, description="System prompt (camelCase)")
    model: ModelConfigModel | None = Field(None, description="Model configuration")
    saveToHistory: bool | None = Field(None, description="Save to history")
    chatId: str | None = Field(None, description="Chat ID")


class RAGChatStreamRequest(BaseModel):
    """RAG chat stream request model"""

    messages: list[StreamMessageModel] = Field(..., description="Message list")
    system_prompt: str | None = Field(None, description="System prompt")
    model: ModelConfigModel | None = Field(None, description="Model configuration")
    knowledge_base_id: str = Field(..., description="Knowledge base ID")
    query: str | None = Field(None, description="Query text")
