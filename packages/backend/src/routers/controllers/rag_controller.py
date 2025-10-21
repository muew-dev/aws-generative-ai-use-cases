"""RAG Controller

FastAPI controller for RAG operations with type-safe responses
"""

import json
import logging
from collections.abc import AsyncIterator

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from application.usecases.rag_stream_usecase import RAGStreamUseCase
from application.usecases.retrieve_documents_usecase import RetrieveDocumentsUseCase
from models.domain_errors import DomainError
from schemas.requests.message_requests import ModelConfigModel
from schemas.responses.message_responses import (
    DocumentData,
    RAGRetrievalData,
    SSEDocumentsEvent,
    SSEDoneEvent,
    SSEErrorEvent,
    SSEMetadataEvent,
    SSERetrievalEvent,
    SSETokenEvent,
)

logger = logging.getLogger(__name__)


class RAGController:
    """FastAPI controller for RAG endpoints"""

    def __init__(
        self,
        retrieve_documents_usecase: RetrieveDocumentsUseCase,
        rag_stream_usecase: RAGStreamUseCase,
    ):
        self.retrieve_documents_usecase = retrieve_documents_usecase
        self.rag_stream_usecase = rag_stream_usecase

    async def retrieve_documents(
        self,
        request: Request,
        query: str,
        knowledge_base_id: str,
        max_results: int = 5,
        confidence_threshold: float = 0.7,
    ) -> RAGRetrievalData:
        """Retrieve documents from knowledge base

        GET /api/rag/retrieve?query=...&knowledgeBaseId=...
        """
        try:
            logger.info(f"Document retrieval request: {query[:50]}")

            documents = await self.retrieve_documents_usecase.execute(
                query=query,
                knowledge_base_id=knowledge_base_id,
                max_results=max_results,
                confidence_threshold=confidence_threshold,
            )

            # Create result object for from_domain conversion
            class RetrievalResult:
                def __init__(self, query: str, documents: list, total_results: int):
                    self.query = query
                    self.documents = documents
                    self.total_results = total_results

            result = RetrievalResult(
                query=query, documents=documents, total_results=len(documents)
            )

            return RAGRetrievalData.from_domain(result)

        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except DomainError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            logger.error(f"Document retrieval error: {e}")
            raise HTTPException(status_code=500, detail="Internal server error") from e

    async def rag_chat_stream(
        self,
        request: Request,
        query: str,
        knowledge_base_id: str,
        model_config: ModelConfigModel | None = None,
        system_prompt: str | None = None,
    ) -> StreamingResponse:
        """Stream RAG chat response

        POST /api/rag/chat-stream
        """
        # Validate inputs before starting stream
        if not query or not query.strip():
            raise HTTPException(status_code=422, detail="Query is required")
        if not knowledge_base_id or not knowledge_base_id.strip():
            raise HTTPException(status_code=422, detail="Knowledge base ID is required")

        try:
            logger.info(f"RAG streaming request: {query[:50]}")

            return StreamingResponse(
                self._rag_stream_generator(
                    query=query,
                    knowledge_base_id=knowledge_base_id,
                    model_config=model_config,
                    system_prompt=system_prompt,
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
            # Re-raise validation errors as-is
            raise
        except Exception as e:
            logger.error(f"RAG streaming setup error: {e}")
            raise HTTPException(status_code=500, detail="Internal server error") from e

    async def _rag_stream_generator(
        self,
        query: str,
        knowledge_base_id: str,
        model_config: ModelConfigModel | None = None,
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        """Generate Server-Sent Events stream for RAG"""
        try:
            # Use model_config directly (already ModelConfigModel)
            model_request = model_config

            # Execute streaming use case
            async for chunk in self.rag_stream_usecase.execute(
                query=query,
                knowledge_base_id=knowledge_base_id,
                model_config=model_request,
                system_prompt=system_prompt,
            ):
                # Convert chunk to SSE format
                if chunk.type == "retrieval":
                    if chunk.content:
                        retrieval_event = SSERetrievalEvent(message=chunk.content)
                        yield f"data: {json.dumps(retrieval_event.model_dump())}\n\n"
                    elif chunk.documents:
                        docs = [
                            DocumentData.from_domain(doc) for doc in chunk.documents
                        ]
                        documents_event = SSEDocumentsEvent(documents=docs)
                        yield f"data: {json.dumps(documents_event.model_dump())}\n\n"

                elif chunk.type == "token":
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

            # Ensure final done event
            final_done_event = SSEDoneEvent()
            yield f"data: {json.dumps(final_done_event.model_dump())}\n\n"

        except Exception as e:
            exception_event = SSEErrorEvent(error=f"RAG streaming error: {e!s}")
            logger.error(f"RAG stream generator error: {e}")
            yield f"data: {json.dumps(exception_event.model_dump())}\n\n"
