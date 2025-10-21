"""Dependency Injection Container

Faithful Python translation of DIContainer from unified-api-service
"""

from functools import cached_property

from application.usecases.create_chat_usecase import CreateChatUseCase
from application.usecases.create_message_usecase import CreateMessageUseCase
from application.usecases.list_chats_usecase import ListChatsUseCase
from application.usecases.rag_stream_usecase import RAGStreamUseCase
from application.usecases.retrieve_documents_usecase import RetrieveDocumentsUseCase
from application.usecases.stream_message_usecase import StreamMessageUseCase
from infrastructure.bedrock_rag_repository import BedrockRAGRepository
from infrastructure.bedrock_repository import BedrockRepository
from infrastructure.prisma_chat_repository import (
    PrismaChatRepository,
)
from infrastructure.prisma_client import PrismaClient
from infrastructure.prisma_message_repository import (
    PrismaMessageRepository,
)
from infrastructure.prisma_user_repository import (
    PrismaUserRepository,
)
from repositories.ai_repository import IAIRepository as IBedrockRepository
from repositories.chat_repository import IChatRepository
from repositories.message_repository import IMessageRepository
from repositories.rag_repository import RAGRepository
from repositories.user_repository import IUserRepository
from routers.controllers.chat_controller import ChatController
from routers.controllers.message_controller import MessageController
from routers.controllers.rag_controller import RAGController


class DIContainer:
    """Dependency Injection Container for managing application dependencies"""

    def __init__(self, aws_region: str, bedrock_model_id: str):
        self.aws_region = aws_region
        self.bedrock_model_id = bedrock_model_id
        self._prisma_client: PrismaClient | None = None

    # Infrastructure Layer
    @cached_property
    def get_prisma_client(self) -> PrismaClient:
        """Get Prisma database client"""
        if self._prisma_client is None:
            self._prisma_client = PrismaClient()
        return self._prisma_client

    @cached_property
    def get_user_repository(self) -> IUserRepository:
        """Get User repository implementation"""
        return PrismaUserRepository(self.get_prisma_client)

    @cached_property
    def get_chat_repository(self) -> IChatRepository:
        """Get Chat repository implementation"""
        return PrismaChatRepository(self.get_prisma_client)

    @cached_property
    def get_message_repository(self) -> IMessageRepository:
        """Get Message repository implementation"""
        return PrismaMessageRepository(self.get_prisma_client)

    @cached_property
    def get_bedrock_repository(self) -> IBedrockRepository:
        """Get Bedrock repository implementation"""
        return BedrockRepository(self.aws_region, self.bedrock_model_id)

    @cached_property
    def get_rag_repository(self) -> RAGRepository:
        """Get RAG repository implementation"""
        return BedrockRAGRepository(self.aws_region)

    # Use Cases Layer
    @cached_property
    def get_create_chat_usecase(self) -> CreateChatUseCase:
        """Get CreateChat use case"""
        return CreateChatUseCase(self.get_prisma_client, self.get_user_repository)

    @cached_property
    def get_list_chats_usecase(self) -> ListChatsUseCase:
        """Get ListChats use case"""
        return ListChatsUseCase(self.get_prisma_client, self.get_user_repository)

    @cached_property
    def get_create_message_usecase(self) -> CreateMessageUseCase:
        """Get CreateMessage use case"""
        return CreateMessageUseCase(
            self.get_message_repository,
            self.get_chat_repository,
            self.get_user_repository,
        )

    @cached_property
    def get_stream_message_usecase(self) -> StreamMessageUseCase:
        """Get StreamMessage use case"""
        return StreamMessageUseCase(
            self.get_bedrock_repository,
            self.get_message_repository,
            self.get_chat_repository,
            self.get_user_repository,
        )

    @cached_property
    def get_retrieve_documents_usecase(self) -> RetrieveDocumentsUseCase:
        """Get RetrieveDocuments use case"""
        return RetrieveDocumentsUseCase(self.get_rag_repository)

    @cached_property
    def get_rag_stream_usecase(self) -> RAGStreamUseCase:
        """Get RAGStream use case"""
        return RAGStreamUseCase(self.get_rag_repository)

    # Controllers Layer
    @cached_property
    def get_chat_controller(self) -> ChatController:
        """Get Chat controller"""
        return ChatController(self.get_create_chat_usecase, self.get_list_chats_usecase)

    @cached_property
    def get_message_controller(self) -> MessageController:
        """Get Message controller"""
        return MessageController(
            self.get_create_message_usecase, self.get_stream_message_usecase
        )

    @cached_property
    def get_rag_controller(self) -> RAGController:
        """Get RAG controller"""
        return RAGController(
            self.get_retrieve_documents_usecase, self.get_rag_stream_usecase
        )

    async def initialize(self) -> None:
        """Initialize container and database connections"""
        await self.get_prisma_client.connect()

    async def cleanup(self) -> None:
        """Cleanup resources"""
        if self._prisma_client:
            await self._prisma_client.disconnect()
