"""Create Message Use Case

Faithful Python translation of CreateMessageUseCase from unified-api-service
"""

import asyncio

from models.domain_errors import DomainErrors
from models.message import ContentType, Message, MessageContent, MessageRole
from models.user import UserId
from repositories.chat_repository import IChatRepository
from repositories.message_repository import IMessageRepository
from repositories.user_repository import IUserRepository
from schemas.requests.message_requests import MessageContentModel, ModelConfigModel


class CreateMessageUseCase:
    """Use case for creating a new message"""

    def __init__(
        self,
        message_repository: IMessageRepository,
        chat_repository: IChatRepository,
        user_repository: IUserRepository,
    ):
        self.message_repository = message_repository
        self.chat_repository = chat_repository
        self.user_repository = user_repository

    async def execute(
        self,
        user_id: str,
        chat_id: str,
        role: str,
        content: list[MessageContentModel],
        model: ModelConfigModel | None = None,
    ) -> Message:
        """Execute create message use case

        Args:
            user_id: User ID who creates the message
            chat_id: Chat ID where message belongs
            role: Message role ('user', 'assistant', 'system')
            content: List of type-safe message content requests
            model: Optional model configuration request

        Returns:
            Created Message entity

        Raises:
            DomainError: If user/chat validation fails or content is invalid
        """
        user_id_obj = UserId(user_id)
        chat_id_obj = ChatId(chat_id)

        # Execute validation checks in parallel
        user_task = self.user_repository.find_by_id(user_id_obj)
        chat_task = self.chat_repository.find_by_id(user_id_obj, chat_id_obj)

        user, chat = await asyncio.gather(user_task, chat_task)

        # Validate user exists
        if not user:
            raise DomainErrors.user_not_found(user_id)

        # Validate chat exists
        if not chat:
            raise DomainErrors.chat_not_found(chat_id)

        # Validate chat access (already ensured by repository method but explicit check)
        if chat.user_id.value != user_id:
            raise DomainErrors.chat_access_denied(chat_id, user_id)

        # Validate and convert content
        if not content:
            raise DomainErrors.invalid_message_content("Message content cannot be empty")

        try:
            message_content_list = []
            for content_item in content:
                message_content_list.append(
                    MessageContent(
                        content_type=ContentType(content_item.contentType),
                        body=content_item.body,
                        media_type=content_item.mediaType,
                    )
                )
        except (ValueError, TypeError) as e:
            raise DomainErrors.invalid_message_content(f"Invalid content format: {e!s}")

        # Validate role
        try:
            message_role = MessageRole(role)
        except ValueError as e:
            raise DomainErrors.invalid_message_content(f"Invalid message role: {role}")

        # Convert model config if provided
        model_config = None
        if model:
            try:
                from models.message import ModelConfig

                model_config = ModelConfig(
                    model_id=model.modelId
                    or "anthropic.claude-3-5-sonnet-20240620-v1:0",
                    temperature=model.temperature,
                    max_tokens=model.maxTokens,
                    top_p=model.topP,
                    stop_sequences=model.stopSequences,
                )
            except (ValueError, TypeError) as e:
                raise DomainErrors.invalid_message_content(
                    f"Invalid model configuration: {e!s}"
                )

        # Create message with business rules
        message = Message.create(
            chat_id=chat_id_obj,
            user_id=user_id_obj,
            role=message_role,
            content=message_content_list,
            model=model_config,
        )

        # Persist message
        await self.message_repository.save(message)

        return message
