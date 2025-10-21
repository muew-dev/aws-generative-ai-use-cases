"""RetrieveDocumentsUseCaseの単体テスト

TDDアプローチに従い、期待される入出力パターンを検証する
外部依存（RAGRepository）をモック化してビジネスロジックに集中
"""

import pytest
from unittest.mock import AsyncMock, Mock

from domain.entities.rag import RetrievedDocument
from domain.repositories.rag_repository import RAGRepository
from usecases.rag.retrieve_documents_usecase import RetrieveDocumentsUseCase
from tests.factories import RAGTestDataFactory


class TestRetrieveDocumentsUseCase:
    """文書検索ユースケースの単体テスト"""

    @pytest.fixture
    def mock_rag_repository(self):
        """モック化されたRAGRepositoryを提供"""
        return Mock(spec=RAGRepository)

    @pytest.fixture
    def usecase(self, mock_rag_repository):
        """テスト対象のユースケースインスタンスを提供"""
        return RetrieveDocumentsUseCase(mock_rag_repository)

    @pytest.mark.asyncio
    async def test_execute_with_valid_query_returns_documents(
        self, usecase, mock_rag_repository
    ):
        """有効なクエリで関連文書が正常に取得されることを確認"""
        # Arrange
        query = "AWS Bedrockについて教えてください"
        knowledge_base_id = "test-kb-123"
        max_results = 5
        confidence_threshold = 0.7
        
        expected_documents = [
            RAGTestDataFactory.create_retrieved_document(
                content="AWS Bedrockガイド第1章",
                confidence_score=0.9
            ),
            RAGTestDataFactory.create_retrieved_document(
                content="AWS Bedrockガイド第2章", 
                confidence_score=0.8
            ),
        ]
        
        mock_rag_repository.retrieve_documents = AsyncMock(
            return_value=expected_documents
        )

        # Act
        result = await usecase.execute(query, knowledge_base_id, max_results, confidence_threshold)

        # Assert
        assert len(result) == 2
        assert result[0].content == "AWS Bedrockガイド第1章"
        assert result[1].content == "AWS Bedrockガイド第2章"
        mock_rag_repository.retrieve_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_with_no_results_returns_empty_list(
        self, usecase, mock_rag_repository
    ):
        """検索結果が0件の場合、空のリストが返されることを確認"""
        # Arrange
        query = "存在しない情報"
        knowledge_base_id = "test-kb"
        mock_rag_repository.retrieve_documents = AsyncMock(return_value=[])

        # Act
        result = await usecase.execute(query, knowledge_base_id)

        # Assert
        assert result == []
        mock_rag_repository.retrieve_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_with_repository_error_raises_exception(
        self, usecase, mock_rag_repository
    ):
        """リポジトリでエラーが発生した場合、例外が発生することを確認"""
        # Arrange
        query = "テストクエリ"
        knowledge_base_id = "test-kb"
        mock_rag_repository.retrieve_documents = AsyncMock(
            side_effect=Exception("Knowledge base connection failed")
        )

        # Act & Assert
        with pytest.raises(Exception) as exc_info:
            await usecase.execute(query, knowledge_base_id)
        
        assert "Knowledge base connection failed" in str(exc_info.value)
        mock_rag_repository.retrieve_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_with_empty_query_raises_value_error(
        self, usecase, mock_rag_repository
    ):
        """空のクエリでValueErrorが発生することを確認"""
        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await usecase.execute("", "test-kb")
        
        assert "empty" in str(exc_info.value).lower()
        mock_rag_repository.retrieve_documents.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_with_empty_knowledge_base_id_raises_value_error(
        self, usecase, mock_rag_repository
    ):
        """空のナレッジベースIDでValueErrorが発生することを確認"""
        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await usecase.execute("有効なクエリ", "")
        
        assert "knowledge base" in str(exc_info.value).lower()
        mock_rag_repository.retrieve_documents.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_respects_max_results_and_confidence_threshold(
        self, usecase, mock_rag_repository
    ):
        """最大結果数と信頼度閾値が適切に適用されることを確認"""
        # Arrange
        query = "テストクエリ"
        knowledge_base_id = "test-kb"
        max_results = 3
        confidence_threshold = 0.8
        expected_documents = [
            RAGTestDataFactory.create_retrieved_document(content=f"文書{i}")
            for i in range(3)
        ]
        
        mock_rag_repository.retrieve_documents = AsyncMock(
            return_value=expected_documents
        )

        # Act
        result = await usecase.execute(query, knowledge_base_id, max_results, confidence_threshold)

        # Assert
        assert len(result) == 3
        # リポジトリが正しいパラメータで呼ばれることを確認
        call_args = mock_rag_repository.retrieve_documents.call_args[0][0]
        assert call_args.query == query
        assert call_args.knowledge_base_id == knowledge_base_id
        assert call_args.max_results == max_results
        assert call_args.confidence_threshold == confidence_threshold