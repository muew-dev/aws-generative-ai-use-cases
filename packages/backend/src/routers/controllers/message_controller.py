"""Message Controller

FastAPI controller for message operations with type-safe responses
"""

import json
from collections.abc import AsyncIterator

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from application.usecases.create_message_usecase import CreateMessageUseCase
from application.usecases.stream_message_usecase import StreamMessageUseCase
from models.domain_errors import DomainError, DomainErrorCode
from schemas.requests.message_requests import (
    MessageContentModel,
    ModelConfigModel,
    StreamMessageModel,
)
from schemas.responses.message_responses import (
    MessageData,
    SSEDoneEvent,
    SSEErrorEvent,
    SSEMetadataEvent,
    SSETokenEvent,
)


class MessageController:
    """FastAPI controller for message endpoints"""

    def __init__(
        self,
        create_message_usecase: CreateMessageUseCase,
        stream_message_usecase: StreamMessageUseCase,
    ):
        self.create_message_usecase = create_message_usecase
        self.stream_message_usecase = stream_message_usecase

    async def create_message(
        self,
        request: Request,
        chat_id: str,
        role: str,
        content: list[MessageContentModel],
        system_prompt: str | None = None,
        model: ModelConfigModel | None = None,
    ) -> MessageData:
        """Create a new message

        POST /api/chats/{chatId}/messages
        """
        try:
            # Get user from authentication
            user_id = self._get_user_id(request)

            # Execute use case with type-safe conversion (content is already MessageContentModel)
            content_requests = content
            model_request = model
            message = await self.create_message_usecase.execute(
                user_id=user_id,
                chat_id=chat_id,
                role=role,
                content=content_requests,
                model=model_request,
            )

            return MessageData.from_domain(message)

        except DomainError as e:
            match e.code:
                case DomainErrorCode.USER_NOT_FOUND | DomainErrorCode.CHAT_NOT_FOUND:
                    raise HTTPException(status_code=404, detail=str(e))
                case DomainErrorCode.CHAT_ACCESS_DENIED:
                    raise HTTPException(status_code=403, detail=str(e))
                case DomainErrorCode.INVALID_MESSAGE_CONTENT:
                    raise HTTPException(status_code=422, detail=str(e))
                case (
                    DomainErrorCode.AI_SERVICE_ERROR
                    | DomainErrorCode.RATE_LIMIT_EXCEEDED
                    | DomainErrorCode.MODEL_NOT_AVAILABLE
                ):
                    raise HTTPException(status_code=502, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error") from e

    async def stream_message(
        self,
        request: Request,
        messages: list[StreamMessageModel] | None = None,
        system_prompt: str | None = None,
        model: ModelConfigModel | None = None,
        save_to_history: bool = False,
        chat_id: str | None = None,
        messages_param: str | None = None,
        model_param: str | None = None,
    ) -> StreamingResponse:
        """Stream AI response

        POST /api/predict-stream (for JSON body)
        GET /api/predict-stream (for query parameters)
        """
        try:
            # Handle GET request with query parameters
            if request.method == "GET" and messages_param:
                try:
                    messages_data = json.loads(messages_param)
                    messages = [StreamMessageModel(**msg) for msg in messages_data]
                except (json.JSONDecodeError, ValueError) as e:
                    raise HTTPException(
                        status_code=422, detail="Invalid messages JSON"
                    ) from e

                if model_param:
                    try:
                        model_data = json.loads(model_param)
                        model = ModelConfigModel(**model_data)
                    except (json.JSONDecodeError, ValueError) as e:
                        raise HTTPException(
                            status_code=422, detail="Invalid model JSON"
                        ) from e

            if not messages:
                raise HTTPException(status_code=422, detail="Messages are required")

            # Get user ID if saving to history
            user_id = None
            if save_to_history:
                user_id = self._get_user_id(request)

            # Create streaming response
            return StreamingResponse(
                self._stream_generator(
                    messages=messages,
                    system_prompt=system_prompt,
                    model=model,
                    save_to_history=save_to_history,
                    chat_id=chat_id,
                    user_id=user_id,
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST",
                    "Access-Control-Allow-Headers": (
                        "Content-Type, Authorization, x-api-key"
                    ),
                },
            )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error") from e

    async def _stream_generator(
        self,
        messages: list[StreamMessageModel],
        system_prompt: str | None,
        model: ModelConfigModel | None,
        save_to_history: bool,
        chat_id: str | None,
        user_id: str | None,
    ) -> AsyncIterator[str]:
        """Generate Server-Sent Events stream"""
        try:
            # Execute streaming use case (messages are already StreamMessageModel)
            message_requests = messages
            model_request = model
            async for chunk in self.stream_message_usecase.execute(
                messages=message_requests,
                system_prompt=system_prompt,
                model=model_request,
                save_to_history=save_to_history,
                chat_id=chat_id,
                user_id=user_id,
            ):
                # Convert chunk to SSE format
                if chunk.type == "token":
                    token_event = SSETokenEvent(token=chunk.token or "")
                    yield f"data: {json.dumps(token_event.model_dump())}\n\n"

                elif chunk.type == "metadata":
                    metadata_event = SSEMetadataEvent(
                        metadata=chunk.metadata.__dict__ if chunk.metadata else {}
                    )
                    yield f"data: {json.dumps(metadata_event.model_dump())}\n\n"

                elif chunk.type == "error":
                    error_event = SSEErrorEvent(error=chunk.error or "Unknown error")
                    yield f"data: {json.dumps(error_event.model_dump())}\n\n"
                    break

                elif chunk.type == "done":
                    done_event = SSEDoneEvent()
                    yield f"data: {json.dumps(done_event.model_dump())}\n\n"
                    break

            # Send final done event if not already sent
            final_done_event = SSEDoneEvent()
            yield f"data: {json.dumps(final_done_event.model_dump())}\n\n"

        except UserNotFoundError as e:
            user_error_event = SSEErrorEvent(error=f"User not found: {e!s}")
            yield f"data: {json.dumps(user_error_event.model_dump())}\n\n"

        except ChatNotFoundError as e:
            chat_error_event = SSEErrorEvent(error=f"Chat not found: {e!s}")
            yield f"data: {json.dumps(chat_error_event.model_dump())}\n\n"

        except ChatAccessDeniedError as e:
            access_error_event = SSEErrorEvent(error=f"Access denied: {e!s}")
            yield f"data: {json.dumps(access_error_event.model_dump())}\n\n"

        except DomainError as e:
            domain_error_event = SSEErrorEvent(error=str(e))
            yield f"data: {json.dumps(domain_error_event.model_dump())}\n\n"

        except Exception:
            generic_error_event = SSEErrorEvent(error="Internal server error")
            yield f"data: {json.dumps(generic_error_event.model_dump())}\n\n"

    def _get_user_id(self, request: Request) -> str:
        """Extract user ID from request state set by authentication middleware"""
        if hasattr(request.state, "user") and request.state.user:
            user_id = request.state.user.get("userId")
            if user_id:
                return str(user_id)

        # This should not happen if authentication middleware is working correctly
        raise HTTPException(status_code=401, detail="Authentication required")
