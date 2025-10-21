"""Retrieve Documents Use Case"""

import logging

from models.rag import RAGQuery, RetrievedDocument
from repositories.rag_repository import RAGRepository

logger = logging.getLogger(__name__)


class RetrieveDocumentsUseCase:
    """Use case for retrieving documents from knowledge base"""

    def __init__(self, rag_repository: RAGRepository):
        self.rag_repository = rag_repository

    async def execute(
        self,
        query: str,
        knowledge_base_id: str,
        max_results: int = 5,
        confidence_threshold: float = 0.7,
    ) -> list[RetrievedDocument]:
        """Execute document retrieval

        Args:
            query: Search query text
            knowledge_base_id: Bedrock Knowledge Base ID
            max_results: Maximum number of results to return
            confidence_threshold: Minimum confidence score for results

        Returns:
            List of retrieved documents

        Raises:
            Exception: If retrieval fails
        """
        if not query.strip():
            raise ValueError("Query cannot be empty")

        if not knowledge_base_id.strip():
            raise ValueError("Knowledge base ID cannot be empty")

        logger.info(f"Retrieving documents for query: {query[:100]}")

        rag_query = RAGQuery(
            query=query,
            knowledge_base_id=knowledge_base_id,
            max_results=max_results,
            confidence_threshold=confidence_threshold,
        )

        documents = await self.rag_repository.retrieve_documents(rag_query)

        logger.info(f"Retrieved {len(documents)} documents")
        return documents
