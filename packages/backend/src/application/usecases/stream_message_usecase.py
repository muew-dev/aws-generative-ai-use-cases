"""Stream Message Use Case

Faithful Python translation of StreamMessageUseCase from unified-api-service
Most complex use case with AI streaming, conditional database saves, and error handling
"""

import asyncio
from collections.abc import AsyncGenerator

from infrastructure.bedrock_models import BedrockMessageList
from models.domain_errors import DomainErrors
from models.message import (
    ContentType,
    Message,
    MessageContent,
    MessageRole,
    ModelConfig,
)
from models.user import UserId
from repositories.ai_repository import (
    IAIRepository as IBedrockRepository,
)
from repositories.ai_repository import (
    StreamChunk as BedrockStreamChunk,
)
from repositories.chat_repository import IChatRepository
from repositories.message_repository import IMessageRepository
from repositories.user_repository import IUserRepository
from schemas.requests.message_requests import ModelConfigModel, StreamMessageModel


class StreamMessageUseCase:
    """Use case for streaming AI responses with optional database persistence"""

    def __init__(
        self,
        bedrock_repository: IBedrockRepository,
        message_repository: IMessageRepository,
        chat_repository: IChatRepository,
        user_repository: IUserRepository,
    ):
        self.bedrock_repository = bedrock_repository
        self.message_repository = message_repository
        self.chat_repository = chat_repository
        self.user_repository = user_repository

    async def execute(
        self,
        messages: list[StreamMessageModel],
        system_prompt: str | None = None,
        model: ModelConfigModel | None = None,
        save_to_history: bool = False,
        chat_id: str | None = None,
        user_id: str | None = None,
    ) -> AsyncGenerator[BedrockStreamChunk]:
        """Execute stream message use case

        Args:
            messages: List of type-safe message requests
            system_prompt: Optional system prompt for AI
            model: Optional model configuration request
            save_to_history: Whether to save messages to database
            chat_id: Chat ID for saving (required if save_to_history=True)
            user_id: User ID for saving (required if save_to_history=True)

        Yields:
            BedrockStreamChunk: Stream chunks from AI model

        Raises:
            UserNotFoundError: If user does not exist (when saving)
            ChatNotFoundError: If chat does not exist (when saving)
            ChatAccessDeniedError: If user doesn't have access to chat (when saving)
            InvalidMessageContentError: If message format is invalid
            AIServiceError: If AI service fails
        """
        user_obj = None
        chat_obj = None
        accumulated_response = ""

        try:
            # Validate and setup for database saving if required
            if save_to_history:
                if not user_id or not chat_id:
                    raise DomainErrors.invalid_message_content(
                        "user_id and chat_id are required when save_to_history=True"
                    )

                user_id_obj = UserId(user_id)
                chat_id_obj = ChatId(chat_id)

                # Validate user and chat in parallel
                user_task = self.user_repository.find_by_id(user_id_obj)
                chat_task = self.chat_repository.find_by_id(user_id_obj, chat_id_obj)

                user_obj, chat_obj = await asyncio.gather(user_task, chat_task)

                # Validate user exists
                if not user_obj:
                    raise DomainErrors.user_not_found(user_id)

                # Validate chat exists
                if not chat_obj:
                    raise DomainErrors.chat_not_found(chat_id)

                # Validate chat access
                if chat_obj.user_id.value != user_id:
                    raise DomainErrors.chat_access_denied(chat_id, user_id)

                # Save user message if saving to history
                if messages:
                    last_message = messages[-1]
                    if last_message.role == "user":
                        await self._save_user_message(
                            user_id_obj, chat_id_obj, last_message
                        )

            # Validate messages format
            validated_messages = self._validate_messages(messages)

            # Prepare model configuration
            model_config = self._prepare_model_config(model)

            # Stream AI response
            async for chunk in self.bedrock_repository.invoke_stream(
                model_config=model_config,
                messages=validated_messages,
                system_prompt=system_prompt,
            ):
                # Accumulate response tokens for saving
                if chunk.type == "token" and chunk.token:
                    accumulated_response += chunk.token

                # Yield chunk to caller
                yield chunk

                # Handle stream completion
                if (
                    chunk.type == "metadata"
                    and chunk.metadata
                    and chunk.metadata.get("stop_reason")
                ):
                    break

            # Save assistant response if saving to history
            if (
                save_to_history
                and accumulated_response.strip()
                and user_obj
                and chat_obj
            ):
                await self._save_assistant_message(
                    user_obj.id, chat_obj.id, accumulated_response, model_config
                )

        except Exception as e:
            # All domain errors should now be DomainError instances
            # Re-raise domain errors as-is, wrap others
            from models.domain_errors import DomainError
            if isinstance(e, DomainError):
                raise e
            else:
                raise DomainErrors.ai_service_error(f"Streaming failed: {e!s}", e)

    def _validate_messages(
        self, messages: list[StreamMessageModel]
    ) -> BedrockMessageList:
        """Validate and convert messages to proper format"""
        if not messages:
            raise DomainErrors.invalid_message_content("Messages list cannot be empty")

        validated_messages = []

        for msg in messages:
            if msg.role not in ["user", "assistant", "system"]:
                raise DomainErrors.invalid_message_content(f"Invalid message role: {msg.role}")

            if not msg.content:
                raise DomainErrors.invalid_message_content("Message content cannot be empty")

            # Convert content to MessageContent objects
            content_objects = []
            try:
                # Convert list of MessageContentModel to text
                content_text = (
                    " ".join([c.body for c in msg.content])
                    if isinstance(msg.content, list)
                    else str(msg.content)
                )
                content_obj = MessageContent(
                    content_type=ContentType.TEXT,
                    body=content_text,
                    media_type=None,
                )
                content_objects.append(content_obj)
            except (ValueError, TypeError) as e:
                raise InvalidMessageContentError(
                    f"Invalid content format: {e!s}"
                ) from e

            validated_messages.append({"role": msg.role, "content": content_objects})

        return BedrockMessageList.from_domain_messages(validated_messages)

    def _prepare_model_config(self, model: ModelConfigModel | None) -> ModelConfig:
        """Prepare model configuration with defaults"""
        if not model:
            return self.bedrock_repository.get_default_model()

        try:
            default_model = self.bedrock_repository.get_default_model()
            return ModelConfig(
                model_id=model.modelId or default_model.model_id,
                temperature=model.temperature or 0.7,
                max_tokens=model.maxTokens or 4096,
                top_p=model.topP or 0.9,
                stop_sequences=model.stopSequences,
            )
        except (ValueError, TypeError) as e:
            raise DomainErrors.invalid_message_content(
                f"Invalid model configuration: {e!s}"
            )

    async def _save_user_message(
        self, user_id: UserId, chat_id: ChatId, message_data: StreamMessageModel
    ) -> Message:
        """Save user message to database"""
        try:
            # Convert content (StreamMessageModel has simple text content)
            content_objects = []
            # Convert content to string if it's a list
            content_text = (
                " ".join([c.body for c in message_data.content])
                if isinstance(message_data.content, list)
                else str(message_data.content)
            )
            content_obj = MessageContent(
                content_type=ContentType.TEXT,
                body=content_text,
                media_type=None,
            )
            content_objects.append(content_obj)

            # Create and save user message
            user_message = Message.create(
                chat_id=chat_id,
                user_id=user_id,
                role=MessageRole.USER,
                content=content_objects,
            )

            await self.message_repository.save(user_message)
            return user_message

        except Exception as e:
            raise InvalidMessageContentError(
                f"Failed to save user message: {e!s}"
            ) from e

    async def _save_assistant_message(
        self,
        user_id: UserId,
        chat_id: ChatId,
        response_text: str,
        model_config: ModelConfig,
    ) -> Message:
        """Save assistant response to database"""
        try:
            # Create text content
            content = [
                MessageContent(
                    content_type=ContentType.TEXT,
                    body=response_text,
                    media_type="text/plain",
                )
            ]

            # Create and save assistant message
            assistant_message = Message.create(
                chat_id=chat_id,
                user_id=user_id,
                role=MessageRole.ASSISTANT,
                content=content,
                model=model_config,
            )

            await self.message_repository.save(assistant_message)
            return assistant_message

        except Exception as e:
            # Log error but don't fail the stream
            print(f"Warning: Failed to save assistant message: {e!s}")
            raise InvalidMessageContentError(
                f"Failed to save assistant message: {e!s}"
            ) from e
