"""RAG Response Models

Type-safe response models for RAG-related API responses.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DocumentData:
    """Document data response"""

    content: str
    metadata: dict[str, str] | None = None

    @classmethod
    def from_domain(cls, document: Any) -> "DocumentData":
        """Create from domain document"""
        return cls(content=document.content, metadata=document.metadata)


@dataclass(frozen=True)
class RAGRetrievalData:
    """RAG retrieval data response"""

    documents: list[DocumentData]

    @classmethod
    def from_domain(cls, retrieval_data: Any) -> "RAGRetrievalData":
        """Create from domain retrieval data"""
        return cls(
            documents=[
                DocumentData.from_domain(doc) for doc in retrieval_data.documents
            ]
        )


@dataclass(frozen=True)
class SSEDocumentsEvent:
    """SSE documents event"""

    type: str = "documents"
    documents: list[DocumentData] | None = None

    def model_dump(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {"type": self.type, "documents": self.documents}


@dataclass(frozen=True)
class SSERetrievalEvent:
    """SSE retrieval event"""

    type: str = "retrieval"
    retrieval: RAGRetrievalData | None = None
    message: str = ""

    def model_dump(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {"type": self.type, "retrieval": self.retrieval, "message": self.message}