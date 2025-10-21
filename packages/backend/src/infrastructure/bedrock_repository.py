"""Bedrock Repository Implementation

Faithful Python translation of BedrockRepository from unified-api-service
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from typing import Any

import boto3
from botocore.exceptions import ClientError
from infrastructure.bedrock_config import BedrockInferenceConfig, BedrockRequest
from infrastructure.bedrock_types import BedrockSystemDict

from infrastructure.bedrock_models import BedrockMessageList
from models.domain_errors import DomainErrors
from models.message import ModelConfig
from repositories.ai_repository import (
    IAIRepository as IBedrockRepository,
)
from repositories.ai_repository import (
    StreamChunk as BedrockStreamChunk,
)

logger = logging.getLogger(__name__)


class BedrockRepository(IBedrockRepository):
    """AWS Bedrock-based AI model repository implementation"""

    def __init__(self, region: str, default_model_id: str):
        self.region = region
        self.default_model_id = default_model_id
        self.client = boto3.client("bedrock-runtime", region_name=region)

    def invoke_stream(
        self,
        model_config: ModelConfig,
        messages: BedrockMessageList,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[BedrockStreamChunk]:
        """Stream AI model response using AWS Bedrock"""
        return self._invoke_stream_impl(model_config, messages, system_prompt)

    async def _invoke_stream_impl(
        self,
        model_config: ModelConfig,
        messages: BedrockMessageList,
        system_prompt: str | None = None,
    ) -> AsyncGenerator[BedrockStreamChunk]:
        """Stream AI model response implementation"""
        try:
            # Convert messages to Bedrock format
            bedrock_messages = messages.to_bedrock_format()

            # Prepare type-safe request
            inference_config = BedrockInferenceConfig.from_model_config(model_config)

            system_config = None
            if system_prompt:
                system_config = [BedrockSystemDict(text=system_prompt)]

            request = BedrockRequest(
                model_id=model_config.model_id or self.default_model_id,
                messages=bedrock_messages,
                inference_config=inference_config,
                system_prompt=system_config,
            )

            # Execute streaming request in thread pool (boto3 is synchronous)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, lambda: self.client.converse_stream(**request.to_bedrock_format())
            )

            # Process stream
            if response.get("stream"):
                async for chunk in self._process_stream(response["stream"]):
                    yield chunk

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")

            if error_code == "ThrottlingException":
                raise DomainErrors.rate_limit_exceeded()
            elif error_code == "ValidationException" and "model" in str(e):
                raise DomainErrors.model_not_available(model_config.model_id)
            else:
                yield BedrockStreamChunk(type="error", error=f"AWS error: {e!s}")
                raise DomainErrors.ai_service_error(str(e), e)

        except Exception as e:
            logger.error(f"Bedrock streaming error: {e}")
            yield BedrockStreamChunk(type="error", error=str(e))
            raise DomainErrors.ai_service_error(str(e), e)

    async def invoke(
        self,
        model_config: ModelConfig,
        messages: BedrockMessageList,
        system_prompt: str | None = None,
    ) -> str:
        """Get complete AI model response"""
        try:
            # Convert messages to Bedrock format
            bedrock_messages = messages.to_bedrock_format()

            # Prepare type-safe request
            inference_config = BedrockInferenceConfig.from_model_config(model_config)

            system_config = None
            if system_prompt:
                system_config = [BedrockSystemDict(text=system_prompt)]

            request = BedrockRequest(
                model_id=model_config.model_id or self.default_model_id,
                messages=bedrock_messages,
                inference_config=inference_config,
                system_prompt=system_config,
            )

            # Execute request in thread pool
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, lambda: self.client.converse(**request.to_bedrock_format())
            )

            # Extract text from response
            output = response.get("output", {})
            message = output.get("message", {})
            content_list = message.get("content", [])
            if content_list and content_list[0].get("text"):
                text_content = content_list[0]["text"]
                return str(text_content)

            raise DomainErrors.ai_service_error("No text content in Bedrock response")

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")

            if error_code == "ThrottlingException":
                raise DomainErrors.rate_limit_exceeded()
            elif error_code == "ValidationException" and "model" in str(e):
                raise DomainErrors.model_not_available(model_config.model_id)

            raise DomainErrors.ai_service_error(str(e), e)

        except Exception as e:
            logger.error(f"Bedrock invoke error: {e}")
            raise DomainErrors.ai_service_error(str(e), e)

    def get_default_model(self) -> ModelConfig:
        """Get default model configuration"""
        return ModelConfig(
            model_id=self.default_model_id, temperature=0.7, max_tokens=4096, top_p=0.9
        )

    async def _process_stream(self, stream: Any) -> AsyncGenerator[BedrockStreamChunk]:
        """Process Bedrock response stream"""
        loop = asyncio.get_event_loop()

        try:
            # Process stream in thread pool
            for chunk in stream:

                def process_chunk(c: Any) -> Any:
                    return c

                chunk_data = await loop.run_in_executor(None, process_chunk, chunk)

                # Handle content delta (token)
                if "contentBlockDelta" in chunk_data:
                    delta = chunk_data["contentBlockDelta"]
                    if delta.get("delta", {}).get("text"):
                        yield BedrockStreamChunk(
                            type="token", token=delta["delta"]["text"]
                        )

                # Handle message stop
                elif "messageStop" in chunk_data:
                    stop_reason = chunk_data["messageStop"].get("stopReason")
                    if stop_reason:
                        yield BedrockStreamChunk(
                            type="metadata",
                            metadata={"stop_reason": stop_reason},
                        )
                    break

                # Handle metadata (usage info)
                elif "metadata" in chunk_data:
                    metadata = chunk_data["metadata"]
                    if "usage" in metadata:
                        usage = metadata.get("usage", {})
                        yield BedrockStreamChunk(
                            type="metadata",
                            metadata={
                                "input_tokens": usage.get("inputTokens"),
                                "output_tokens": usage.get("outputTokens"),
                            },
                        )

        except Exception as e:
            logger.error(f"Stream processing error: {e}")
            yield BedrockStreamChunk(
                type="error", error=f"Stream processing error: {e!s}"
            )
