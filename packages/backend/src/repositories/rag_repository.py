"""RAG Repository Interface"""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator

from models.rag import RAGQuery, RAGStreamChunk, RetrievedDocument


class RAGRepository(ABC):
    """Abstract repository for RAG operations"""

    @abstractmethod
    async def retrieve_documents(self, query: RAGQuery) -> list[RetrievedDocument]:
        """Retrieve documents from knowledge base"""
        pass

    @abstractmethod
    def retrieve_and_generate(
        self,
        query: str,
        knowledge_base_id: str,
        model_config: dict | None = None,
    ) -> AsyncGenerator[RAGStreamChunk]:
        """Retrieve documents and generate streaming response"""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if knowledge base is accessible"""
        pass
