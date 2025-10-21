"""RAGドメインエンティティの単体テスト

TDDアプローチに従い、期待される入出力パターンを検証する
"""

import pytest
from datetime import UTC, datetime

from domain.entities.rag import RAGQuery, RAGResponse, RAGStreamChunk, RetrievedDocument
from tests.factories import RAGTestDataFactory


class TestRAGQuery:
    """RAGQueryエンティティのテスト"""

    def test_rag_query_creation_with_valid_data(self):
        """有効なデータでRAGQueryが正常作成されることを確認"""
        # Arrange
        query_text = "AWS Bedrockの使い方を教えてください"
        knowledge_base_id = "test-kb-123"
        max_results = 5
        confidence_threshold = 0.7

        # Act
        rag_query = RAGQuery(
            query=query_text,
            knowledge_base_id=knowledge_base_id,
            max_results=max_results,
            confidence_threshold=confidence_threshold,
        )

        # Assert
        assert rag_query.query == query_text
        assert rag_query.knowledge_base_id == knowledge_base_id
        assert rag_query.max_results == max_results
        assert rag_query.confidence_threshold == confidence_threshold

    def test_rag_query_to_dict_returns_correct_structure(self):
        """RAGQueryのto_dict()が正しい構造を返すことを確認"""
        # Arrange
        rag_query = RAGTestDataFactory.create_rag_query()

        # Act
        result = rag_query.to_dict()

        # Assert
        expected_keys = {"query", "knowledgeBaseId", "maxResults", "confidenceThreshold"}
        assert set(result.keys()) == expected_keys
        assert result["query"] == rag_query.query
        assert result["knowledgeBaseId"] == rag_query.knowledge_base_id
        assert result["maxResults"] == rag_query.max_results
        assert result["confidenceThreshold"] == rag_query.confidence_threshold

    def test_rag_query_with_empty_query_string(self):
        """空のクエリ文字列での動作を確認（バリデーション想定）"""
        # Arrange & Act & Assert
        # 現在の実装では特別な検証はないが、将来的にバリデーション追加を想定
        rag_query = RAGQuery(
            query="",  # 空文字列
            knowledge_base_id="test-kb-123",
            max_results=5,
            confidence_threshold=0.7,
        )
        assert rag_query.query == ""

    def test_rag_query_with_boundary_values(self):
        """境界値での動作を確認"""
        # Arrange & Act - 最小値
        min_query = RAGQuery(
            query="最小",
            knowledge_base_id="kb",
            max_results=1,
            confidence_threshold=0.0,
        )

        # Act - 最大値想定
        max_query = RAGQuery(
            query="A" * 1000,  # 長いクエリ
            knowledge_base_id="very-long-kb-id-" + "x" * 100,
            max_results=100,
            confidence_threshold=1.0,
        )

        # Assert
        assert min_query.max_results == 1
        assert min_query.confidence_threshold == 0.0
        assert max_query.max_results == 100
        assert max_query.confidence_threshold == 1.0


class TestRetrievedDocument:
    """RetrievedDocumentエンティティのテスト"""

    def test_retrieved_document_creation_with_valid_data(self):
        """有効なデータでRetrievedDocumentが正常作成されることを確認"""
        # Arrange
        content = "AWS Bedrockは基盤モデルのサービスです"
        source = "s3://test-bucket/docs/bedrock.pdf"
        confidence_score = 0.85
        metadata = {"page": 1, "section": "intro"}

        # Act
        document = RetrievedDocument(
            content=content,
            source=source,
            confidence_score=confidence_score,
            metadata=metadata,
        )

        # Assert
        assert document.content == content
        assert document.source == source
        assert document.confidence_score == confidence_score
        assert document.metadata == metadata

    def test_retrieved_document_to_dict_returns_correct_structure(self):
        """RetrievedDocumentのto_dict()が正しい構造を返すことを確認"""
        # Arrange
        document = RAGTestDataFactory.create_retrieved_document()

        # Act
        result = document.to_dict()

        # Assert
        expected_keys = {"content", "source", "confidenceScore", "metadata"}
        assert set(result.keys()) == expected_keys
        assert result["content"] == document.content
        assert result["source"] == document.source
        assert result["confidenceScore"] == document.confidence_score
        assert result["metadata"] == document.metadata

    def test_retrieved_document_with_empty_metadata(self):
        """メタデータが空の場合の動作を確認"""
        # Arrange & Act
        document = RetrievedDocument(
            content="テストコンテンツ",
            source="test://source",
            confidence_score=0.7,
            metadata={},  # 空のメタデータ
        )

        # Assert
        assert document.metadata == {}
        result = document.to_dict()
        assert result["metadata"] == {}

    def test_retrieved_document_confidence_score_boundaries(self):
        """信頼度スコアの境界値テスト"""
        # Arrange & Act - 最小値
        min_doc = RetrievedDocument(
            content="最小スコア",
            source="test://min",
            confidence_score=0.0,
            metadata={},
        )

        # Act - 最大値
        max_doc = RetrievedDocument(
            content="最大スコア",
            source="test://max",
            confidence_score=1.0,
            metadata={},
        )

        # Assert
        assert min_doc.confidence_score == 0.0
        assert max_doc.confidence_score == 1.0


class TestRAGResponse:
    """RAGResponseエンティティのテスト"""

    def test_rag_response_creation_with_valid_data(self):
        """有効なデータでRAGResponseが正常作成されることを確認"""
        # Arrange
        query = "テストクエリ"
        generated_answer = "生成されたテキスト"
        documents = [RAGTestDataFactory.create_retrieved_document()]
        session_id = "test-session-123"

        # Act
        response = RAGResponse(
            query=query,
            generated_answer=generated_answer,
            documents=documents,
            session_id=session_id,
        )

        # Assert
        assert response.query == query
        assert response.generated_answer == generated_answer
        assert response.documents == documents
        assert response.session_id == session_id

    def test_rag_response_to_dict_returns_correct_structure(self):
        """RAGResponseのto_dict()が正しい構造を返すことを確認"""
        # Arrange
        response = RAGTestDataFactory.create_rag_response()

        # Act
        result = response.to_dict()

        # Assert
        expected_keys = {
            "query", "generatedAnswer", "documents", "sessionId"
        }
        assert set(result.keys()) == expected_keys
        assert result["query"] == response.query
        assert result["generatedAnswer"] == response.generated_answer
        assert isinstance(result["documents"], list)
        assert len(result["documents"]) > 0
        assert result["sessionId"] == response.session_id

    def test_rag_response_with_empty_documents(self):
        """検索結果が空の場合の動作を確認"""
        # Arrange & Act
        response = RAGResponse(
            query="テスト",
            generated_answer="文書なしでの回答",
            documents=[],  # 空のリスト
            session_id="test-session",
        )

        # Assert
        assert response.documents == []
        result = response.to_dict()
        assert result["documents"] == []

    def test_rag_response_with_multiple_documents(self):
        """複数文書が含まれる場合の動作を確認"""
        # Arrange
        documents = [
            RAGTestDataFactory.create_retrieved_document(content="文書1"),
            RAGTestDataFactory.create_retrieved_document(content="文書2"),
            RAGTestDataFactory.create_retrieved_document(content="文書3"),
        ]

        # Act
        response = RAGResponse(
            query="複数文書テスト",
            generated_answer="複数文書からの回答",
            documents=documents,
            session_id="test-session",
        )

        # Assert
        assert len(response.documents) == 3
        assert response.documents[0].content == "文書1"
        assert response.documents[1].content == "文書2"
        assert response.documents[2].content == "文書3"


class TestRAGStreamChunk:
    """RAGStreamChunkエンティティのテスト"""

    def test_rag_stream_chunk_token_creation(self):
        """トークン型のRAGStreamChunkが正常作成されることを確認"""
        # Arrange & Act
        chunk = RAGStreamChunk(type="token", token="AWS")

        # Assert
        assert chunk.type == "token"
        assert chunk.token == "AWS"
        assert chunk.documents is None
        assert chunk.metadata is None
        assert chunk.error is None

    def test_rag_stream_chunk_retrieval_creation(self):
        """検索結果型のRAGStreamChunkが正常作成されることを確認"""
        # Arrange
        documents = [RAGTestDataFactory.create_retrieved_document()]

        # Act
        chunk = RAGStreamChunk(type="retrieval", documents=documents)

        # Assert
        assert chunk.type == "retrieval"
        assert chunk.documents == documents
        assert chunk.token is None
        assert chunk.metadata is None
        assert chunk.error is None

    def test_rag_stream_chunk_metadata_creation(self):
        """メタデータ型のRAGStreamChunkが正常作成されることを確認"""
        # Arrange
        metadata = {"tokens": 100, "model": "test-model"}

        # Act
        chunk = RAGStreamChunk(type="metadata", metadata=metadata)

        # Assert
        assert chunk.type == "metadata"
        assert chunk.metadata == metadata
        assert chunk.token is None
        assert chunk.documents is None
        assert chunk.error is None

    def test_rag_stream_chunk_error_creation(self):
        """エラー型のRAGStreamChunkが正常作成されることを確認"""
        # Arrange & Act
        chunk = RAGStreamChunk(type="error", error="Knowledge base not found")

        # Assert
        assert chunk.type == "error"
        assert chunk.error == "Knowledge base not found"
        assert chunk.token is None
        assert chunk.documents is None
        assert chunk.metadata is None

    def test_rag_stream_chunk_done_creation(self):
        """完了型のRAGStreamChunkが正常作成されることを確認"""
        # Arrange & Act
        chunk = RAGStreamChunk(type="done")

        # Assert
        assert chunk.type == "done"
        assert chunk.token is None
        assert chunk.documents is None
        assert chunk.metadata is None
        assert chunk.error is None

    def test_rag_stream_chunk_to_dict_returns_correct_structure(self):
        """RAGStreamChunkのto_dict()が正しい構造を返すことを確認"""
        # Arrange
        chunk = RAGTestDataFactory.create_rag_stream_chunk_token("Test")

        # Act
        result = chunk.to_dict()

        # Assert
        # 実装では条件的にキーを追加するため、最低限のキーのみ確認
        assert "type" in result
        assert result["type"] == "token"
        assert "token" in result
        assert result["token"] == "Test"

    def test_rag_stream_chunk_factory_methods(self):
        """ファクトリーメソッドで作成される各種チャンクをテスト"""
        # Arrange & Act
        token_chunk = RAGTestDataFactory.create_rag_stream_chunk_token("Hello")
        retrieval_chunk = RAGTestDataFactory.create_rag_stream_chunk_retrieval()
        metadata_chunk = RAGTestDataFactory.create_rag_stream_chunk_metadata()
        error_chunk = RAGTestDataFactory.create_rag_stream_chunk_error()
        done_chunk = RAGTestDataFactory.create_rag_stream_chunk_done()

        # Assert
        assert token_chunk.type == "token"
        assert token_chunk.token == "Hello"
        
        assert retrieval_chunk.type == "retrieval"
        assert len(retrieval_chunk.documents) == 1
        
        assert metadata_chunk.type == "metadata"
        assert metadata_chunk.metadata is not None
        
        assert error_chunk.type == "error"
        assert error_chunk.error == "Knowledge base not found"
        
        assert done_chunk.type == "done"