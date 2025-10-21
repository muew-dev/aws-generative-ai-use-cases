"""FastAPI Routes

Type-safe API routes with proper validation and error handling
"""

from typing import Any

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import StreamingResponse

from application.di_container import DIContainer
from schemas.requests.chat_requests import CreateChatRequest
from schemas.requests.message_requests import (
    CreateMessageRequest,
    RAGChatStreamRequest,
    StreamRequestModel,
)
from schemas.responses.chat_responses import ChatData, ChatListData
from schemas.responses.common_responses import (
    DetailedHealthData,
    ErrorResponse,
    HealthData,
    ValidationErrorResponse,
)
from schemas.responses.message_responses import MessageData
from schemas.responses.rag_responses import RAGRetrievalData


def create_routes(container: DIContainer) -> APIRouter:
    """Create FastAPI routes with dependency injection"""

    router = APIRouter()

    # Get controllers from container
    chat_controller = container.get_chat_controller
    message_controller = container.get_message_controller
    rag_controller = container.get_rag_controller

    # Chat Routes
    @router.post(
        "/api/chats",
        tags=["Chats"],
        status_code=status.HTTP_201_CREATED,
        response_model=ChatData,
        responses={
            401: {"model": ErrorResponse, "description": "Authentication required"},
            422: {"model": ValidationErrorResponse, "description": "Validation error"},
            500: {"model": ErrorResponse, "description": "Internal server error"},
        },
    )
    async def create_chat(
        request: Request, body: CreateChatRequest | None = None
    ) -> Any:
        """Create a new chat

        Creates a new chat for the authenticated user
        """
        if body is None:
            body = CreateChatRequest(title=None)
        return await chat_controller.create_chat(request=request, title=body.title)

    @router.get(
        "/api/chats",
        tags=["Chats"],
        response_model=ChatListData,
        responses={
            401: {"model": ErrorResponse, "description": "Authentication required"},
            422: {"model": ValidationErrorResponse, "description": "Validation error"},
            500: {"model": ErrorResponse, "description": "Internal server error"},
        },
    )
    async def list_chats(
        request: Request, offset: int | None = None, limit: int | None = None
    ) -> Any:
        """List user's chats

        Retrieves a paginated list of chats for the authenticated user
        """
        return await chat_controller.list_chats(
            request=request, offset=offset, limit=limit
        )

    # Message Routes
    @router.post(
        "/api/chats/{chat_id}/messages",
        tags=["Messages"],
        status_code=status.HTTP_201_CREATED,
        response_model=MessageData,
        responses={
            401: {"model": ErrorResponse, "description": "Authentication required"},
            404: {"model": ErrorResponse, "description": "Chat not found"},
            422: {"model": ValidationErrorResponse, "description": "Validation error"},
            500: {"model": ErrorResponse, "description": "Internal server error"},
        },
    )
    async def create_message(
        request: Request, chat_id: str, body: CreateMessageRequest
    ) -> Any:
        """Create a new message

        Creates a new message in the specified chat
        """
        return await message_controller.create_message(
            request=request,
            chat_id=chat_id,
            role=body.role,
            content=body.content,
            system_prompt=body.systemPrompt,
            model=body.model,
        )

    # Streaming Routes
    @router.post(
        "/api/predict-stream",
        tags=["Streaming"],
        response_class=StreamingResponse,
        responses={
            200: {
                "description": "Streaming response",
                "content": {"text/event-stream": {}},
            },
            401: {"model": ErrorResponse, "description": "Authentication required"},
            422: {"model": ValidationErrorResponse, "description": "Validation error"},
            502: {"model": ErrorResponse, "description": "External service error"},
            500: {"model": ErrorResponse, "description": "Internal server error"},
        },
    )
    async def stream_message_post(
        request: Request, body: StreamRequestModel
    ) -> StreamingResponse:
        """Stream AI response (POST)

        Stream AI response using Server-Sent Events (SSE)
        """
        return await message_controller.stream_message(
            request=request,
            messages=body.messages,
            system_prompt=body.systemPrompt,
            model=body.model,
            save_to_history=bool(body.saveToHistory)
            if body.saveToHistory is not None
            else False,
            chat_id=body.chatId,
        )

    @router.get(
        "/api/predict-stream",
        tags=["Streaming"],
        response_class=StreamingResponse,
        responses={
            200: {
                "description": "Streaming response",
                "content": {"text/event-stream": {}},
            },
            401: {"model": ErrorResponse, "description": "Authentication required"},
            422: {"model": ValidationErrorResponse, "description": "Validation error"},
            502: {"model": ErrorResponse, "description": "External service error"},
            500: {"model": ErrorResponse, "description": "Internal server error"},
        },
    )
    async def stream_message_get(
        request: Request,
        messages: str = Query(..., description="JSON-encoded messages array"),
        system_prompt: str | None = Query(
            None, alias="systemPrompt", description="System prompt"
        ),
        model: str | None = Query(None, description="JSON-encoded model configuration"),
        save_to_history: bool = Query(
            False, alias="saveToHistory", description="Save to chat history"
        ),
        chat_id: str | None = Query(None, alias="chatId", description="Chat ID"),
    ) -> StreamingResponse:
        """Stream AI response (GET)

        Stream AI response using query parameters
        """
        return await message_controller.stream_message(
            request=request,
            messages_param=messages,
            system_prompt=system_prompt,
            model_param=model,
            save_to_history=save_to_history,
            chat_id=chat_id,
        )

    # RAG Routes
    @router.get(
        "/api/rag/retrieve",
        tags=["RAG"],
        response_model=RAGRetrievalData,
        responses={
            401: {"model": ErrorResponse, "description": "Authentication required"},
            422: {"model": ValidationErrorResponse, "description": "Validation error"},
            500: {"model": ErrorResponse, "description": "Internal server error"},
        },
    )
    async def retrieve_documents(
        request: Request,
        query: str,
        knowledge_base_id: str = Query(..., alias="knowledgeBaseId"),
        max_results: int = Query(5, alias="maxResults"),
        confidence_threshold: float = Query(0.7, alias="confidenceThreshold"),
    ) -> Any:
        """Retrieve documents from knowledge base

        Retrieve relevant documents based on the query
        """
        return await rag_controller.retrieve_documents(
            request=request,
            query=query,
            knowledge_base_id=knowledge_base_id,
            max_results=max_results,
            confidence_threshold=confidence_threshold,
        )

    @router.post(
        "/api/rag/chat-stream",
        tags=["RAG"],
        response_class=StreamingResponse,
        responses={
            200: {
                "description": "Streaming response",
                "content": {"text/event-stream": {}},
            },
            401: {"model": ErrorResponse, "description": "Authentication required"},
            422: {"model": ValidationErrorResponse, "description": "Validation error"},
            500: {"model": ErrorResponse, "description": "Internal server error"},
        },
    )
    async def rag_chat_stream(
        request: Request, body: RAGChatStreamRequest
    ) -> StreamingResponse:
        """Stream RAG chat response

        Stream AI response with RAG context using Server-Sent Events (SSE)
        """
        return await rag_controller.rag_chat_stream(
            request=request,
            query=body.query if body.query is not None else "",
            knowledge_base_id=body.knowledge_base_id,
            model_config=body.model,
            system_prompt=body.system_prompt,
        )

    # Health Check Routes
    @router.get("/api/health", tags=["Health"], response_model=HealthData)
    async def health_check() -> HealthData:
        """Basic health check

        Returns basic health status of the API
        """
        return HealthData.create(status="ok", version="1.0.0")

    @router.get(
        "/api/health/detailed",
        tags=["Health"],
        response_model=DetailedHealthData,
    )
    async def detailed_health_check() -> DetailedHealthData:
        """Detailed health check

        Returns health status including database connection test
        """
        # Test database connection
        try:
            prisma_client = container.get_prisma_client
            # Test DB connectivity with simple count query
            await prisma_client.client.user.count()

            return DetailedHealthData.create(
                status="ok", version="1.0.0", services={"database": "connected"}
            )
        except Exception as db_error:
            return DetailedHealthData.create(
                status="degraded",
                version="1.0.0",
                services={"database": f"error: {str(db_error)[:50]}"},
            )

    return router
