"""Bedrock Type Definitions

Type-safe definitions for all Bedrock API interactions, similar to Flutter's fromJson/toJson pattern.
"""

from typing import NotRequired, TypedDict


# Base Bedrock API Types
class BedrockContentDict(TypedDict):
    """Bedrock message content structure"""

    type: str
    text: str
    media_type: NotRequired[str]  # Optional media type


class BedrockMessageDict(TypedDict):
    """Bedrock message structure"""

    role: str
    content: list[BedrockContentDict]


class BedrockSystemDict(TypedDict):
    """Bedrock system prompt structure"""

    text: str


class BedrockConfigDict(TypedDict):
    """Bedrock inference configuration structure"""

    temperature: float
    topP: float
    maxTokens: int
    stopSequences: NotRequired[list[str]]  # Optional field


class BedrockRequestDict(TypedDict):
    """Complete Bedrock API request structure"""

    modelId: str
    messages: list[BedrockMessageDict]
    inferenceConfig: BedrockConfigDict
    system: NotRequired[list[BedrockSystemDict]]  # Optional field


# Response Types
class BedrockUsageDict(TypedDict):
    """Bedrock usage statistics"""

    inputTokens: NotRequired[int]
    outputTokens: NotRequired[int]


class BedrockMetadataDict(TypedDict):
    """Bedrock response metadata"""

    usage: NotRequired[BedrockUsageDict]


class BedrockDeltaDict(TypedDict):
    """Bedrock content delta"""

    text: str


class BedrockContentBlockDeltaDict(TypedDict):
    """Bedrock content block delta"""

    delta: BedrockDeltaDict


class BedrockMessageStopDict(TypedDict):
    """Bedrock message stop event"""

    stopReason: NotRequired[str]


class BedrockStreamChunkDict(TypedDict):
    """Bedrock streaming response chunk"""

    contentBlockDelta: NotRequired[BedrockContentBlockDeltaDict]
    messageStop: NotRequired[BedrockMessageStopDict]
    metadata: NotRequired[BedrockMetadataDict]
