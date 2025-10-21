"""Bedrock Configuration Models

Type-safe models for Bedrock API configurations and requests.
"""

from dataclasses import dataclass

from infrastructure.bedrock_types import (
    BedrockConfigDict,
    BedrockMessageDict,
    BedrockRequestDict,
    BedrockSystemDict,
)
from models.message import ModelConfig


@dataclass(frozen=True)
class BedrockInferenceConfig:
    """Type-safe Bedrock inference configuration"""

    temperature: float
    top_p: float
    max_tokens: int
    stop_sequences: list[str] | None = None

    @classmethod
    def from_model_config(cls, model_config: ModelConfig) -> "BedrockInferenceConfig":
        """Create from domain ModelConfig"""
        return cls(
            temperature=model_config.temperature or 0.7,
            top_p=model_config.top_p or 0.9,
            max_tokens=model_config.max_tokens or 4096,
            stop_sequences=model_config.stop_sequences,
        )

    def to_bedrock_format(self) -> BedrockConfigDict:
        """Convert to type-safe Bedrock API format"""
        config: BedrockConfigDict = {
            "temperature": self.temperature,
            "topP": self.top_p,
            "maxTokens": self.max_tokens,
        }

        if self.stop_sequences:
            config["stopSequences"] = self.stop_sequences

        return config


@dataclass(frozen=True)
class BedrockRequest:
    """Type-safe Bedrock API request"""

    model_id: str
    messages: list[BedrockMessageDict]
    inference_config: BedrockInferenceConfig
    system_prompt: list[BedrockSystemDict] | None = None

    def to_bedrock_format(self) -> BedrockRequestDict:
        """Convert to type-safe Bedrock API request format"""
        request: BedrockRequestDict = {
            "modelId": self.model_id,
            "messages": self.messages,
            "inferenceConfig": self.inference_config.to_bedrock_format(),
        }

        if self.system_prompt:
            request["system"] = self.system_prompt

        return request
