"""RAG Domain Entities"""

from dataclasses import dataclass
from typing import Any


@dataclass
class RetrievedDocument:
    """Retrieved document from knowledge base"""

    content: str
    source: str
    confidence_score: float
    metadata: dict[str, Any]

    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "content": self.content,
            "source": self.source,
            "confidenceScore": self.confidence_score,
            "metadata": self.metadata,
        }


@dataclass
class RAGQuery:
    """RAG query request"""

    query: str
    knowledge_base_id: str
    max_results: int = 5
    confidence_threshold: float = 0.7

    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "query": self.query,
            "knowledgeBaseId": self.knowledge_base_id,
            "maxResults": self.max_results,
            "confidenceThreshold": self.confidence_threshold,
        }


@dataclass
class RAGResponse:
    """RAG response with retrieved documents and generated answer"""

    query: str
    documents: list[RetrievedDocument]
    generated_answer: str | None = None
    session_id: str | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "query": self.query,
            "documents": [doc.to_dict() for doc in self.documents],
            "generatedAnswer": self.generated_answer,
            "sessionId": self.session_id,
        }


@dataclass
class RAGStreamChunk:
    """Streaming chunk for RAG responses"""

    type: str  # "retrieval", "token", "metadata", "error", "done"
    content: str | None = None
    token: str | None = None
    documents: list[RetrievedDocument] | None = None
    metadata: dict[str, Any] | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        result: dict[str, Any] = {"type": self.type}

        if self.content:
            result["content"] = self.content
        if self.token:
            result["token"] = self.token
        if self.documents:
            result["documents"] = [doc.to_dict() for doc in self.documents]
        if self.metadata:
            result["metadata"] = self.metadata
        if self.error:
            result["error"] = self.error

        return result
