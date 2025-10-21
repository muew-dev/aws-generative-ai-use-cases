"""Chat Controller

FastAPI controller for chat operations with type-safe responses
"""

from fastapi import HTTPException, Request

from application.usecases.create_chat_usecase import CreateChatUseCase
from application.usecases.list_chats_usecase import ListChatsUseCase
from models.domain_errors import DomainError, DomainErrorCode, DomainErrors
from schemas.responses.chat_responses import ChatData, ChatListData
from utils.sanitizer import TextSanitizer


class ChatController:
    """FastAPI controller for chat endpoints"""

    def __init__(
        self,
        create_chat_usecase: CreateChatUseCase,
        list_chats_usecase: ListChatsUseCase,
    ):
        self.create_chat_usecase = create_chat_usecase
        self.list_chats_usecase = list_chats_usecase

    async def create_chat(self, request: Request, title: str | None = None) -> ChatData:
        """Create a new chat

        POST /api/chats
        """
        try:
            # Get user from authentication
            user_id = self._get_user_id(request)

            # Sanitize title to prevent XSS attacks
            sanitized_title = TextSanitizer.sanitize_chat_title(title)

            # Execute use case
            chat_data = await self.create_chat_usecase.execute(
                user_id=user_id,
                title=sanitized_title,
            )

            return ChatData.from_prisma(chat_data)

        except DomainError as e:
            match e.code:
                case DomainErrorCode.USER_NOT_FOUND:
                    raise HTTPException(status_code=404, detail=str(e))
                case DomainErrorCode.CHAT_NOT_FOUND:
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
        except Exception:
            raise HTTPException(status_code=500, detail="Internal server error")

    async def list_chats(
        self, request: Request, offset: int | None = None, limit: int | None = None
    ) -> ChatListData:
        """List user's chats with pagination

        GET /api/chats
        """
        try:
            # Get user from authentication
            user_id = self._get_user_id(request)

            # Execute use case
            result = await self.list_chats_usecase.execute(
                user_id=user_id, offset=offset, limit=limit
            )

            return ChatListData.from_prisma_list(result.chats)

        except DomainError as e:
            match e.code:
                case DomainErrorCode.USER_NOT_FOUND:
                    raise HTTPException(status_code=404, detail=str(e))
                case DomainErrorCode.CHAT_NOT_FOUND:
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
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception:
            raise HTTPException(status_code=500, detail="Internal server error")

    def _get_user_id(self, request: Request) -> str:
        """Extract user ID from request state set by authentication middleware"""
        if hasattr(request.state, "user") and request.state.user:
            user_id = request.state.user.get("userId")
            if user_id:
                return str(user_id)

        # This should not happen if authentication middleware is working correctly
        raise HTTPException(status_code=401, detail="Authentication required")
