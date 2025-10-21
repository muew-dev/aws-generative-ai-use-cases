"""RAG Streaming Use Case"""

import logging
from collections.abc import AsyncIterator

from models.rag import RAGStreamChunk
from repositories.rag_repository import RAGRepository
from schemas.requests.message_requests import ModelConfigModel

logger = logging.getLogger(__name__)


class RAGStreamUseCase:
    """Use case for streaming RAG responses"""

    def __init__(self, rag_repository: RAGRepository):
        self.rag_repository = rag_repository

    async def execute(
        self,
        query: str,
        knowledge_base_id: str,
        model_config: ModelConfigModel | None = None,
        system_prompt: str | None = None,
    ) -> AsyncIterator[RAGStreamChunk]:
        """Execute RAG streaming

        Args:
            query: User query
            knowledge_base_id: Bedrock Knowledge Base ID
            model_config: Model configuration request object
            system_prompt: System prompt to prepend (optional)

        Yields:
            RAGStreamChunk: Streaming response chunks

        Raises:
            Exception: If streaming fails
        """
        if not query.strip():
            yield RAGStreamChunk(type="error", error="Query cannot be empty")
            return

        if not knowledge_base_id.strip():
            yield RAGStreamChunk(
                type="error", error="Knowledge base ID cannot be empty"
            )
            return

        logger.info(f"Starting RAG streaming for query: {query[:100]}")

        try:
            # Modify query with system prompt if provided
            enhanced_query = query
            if system_prompt:
                enhanced_query = f"{system_prompt}\n\nUser: {query}"

            # Convert ModelConfigModel to dict if provided
            model_dict = None
            if model_config:
                model_dict = {
                    "modelId": model_config.modelId,
                    "temperature": model_config.temperature,
                    "maxTokens": model_config.maxTokens,
                    "topP": model_config.topP,
                    "stopSequences": model_config.stopSequences,
                }

            # Stream response from repository
            async for chunk in self.rag_repository.retrieve_and_generate(
                query=enhanced_query,
                knowledge_base_id=knowledge_base_id,
                model_config=model_dict,
            ):
                yield chunk

        except Exception as e:
            error_msg = f"RAG streaming error: {e!s}"
            logger.error(error_msg)
            yield RAGStreamChunk(type="error", error=error_msg)
