"""RAGStreamUseCaseの単体テスト

TDDアプローチに従い、ストリーミングRAG機能の期待される動作を検証する
非同期ジェネレーターのテストパターンを含む
"""

import pytest
from unittest.mock import AsyncMock, Mock
from collections.abc import AsyncGenerator

from domain.entities.rag import RAGStreamChunk
from domain.repositories.rag_repository import RAGRepository
from usecases.rag.rag_stream_usecase import RAGStreamUseCase
from tests.factories import RAGTestDataFactory


class TestRAGStreamUseCase:
    """RAGストリーミングユースケースの単体テスト"""

    @pytest.fixture
    def mock_rag_repository(self):
        """モック化されたRAGRepositoryを提供"""
        return Mock(spec=RAGRepository)

    @pytest.fixture
    def usecase(self, mock_rag_repository):
        """テスト対象のユースケースインスタンスを提供"""
        return RAGStreamUseCase(mock_rag_repository)


    @pytest.mark.asyncio
    async def test_execute_with_valid_query_yields_expected_chunks(
        self, usecase, mock_rag_repository
    ):
        """有効なクエリでストリーミング応答が正常に生成されることを確認"""
        # Arrange
        query = "AWS Bedrockの使い方を教えてください"
        knowledge_base_id = "test-kb-123"
        expected_chunks = [
            RAGTestDataFactory.create_rag_stream_chunk_retrieval(),
            RAGTestDataFactory.create_rag_stream_chunk_token("AWS"),
            RAGTestDataFactory.create_rag_stream_chunk_token(" Bedrock"),
            RAGTestDataFactory.create_rag_stream_chunk_done(),
        ]
        
        # Track calls manually
        call_history = []
        
        async def mock_generator(*args, **kwargs):
            # Record the call
            call_history.append({'args': args, 'kwargs': kwargs})
            for chunk in expected_chunks:
                yield chunk
        
        # Assign the generator function directly
        mock_rag_repository.retrieve_and_generate = mock_generator

        # Act
        result_chunks = []
        async for chunk in usecase.execute(query, knowledge_base_id):
            result_chunks.append(chunk)

        # Assert
        assert len(result_chunks) == 4
        assert result_chunks[0].type == "retrieval"
        assert result_chunks[1].type == "token"
        assert result_chunks[1].token == "AWS"
        assert result_chunks[-1].type == "done"
        
        # Verify the call was made with correct parameters
        assert len(call_history) == 1
        call = call_history[0]
        assert call['kwargs']['query'] == query
        assert call['kwargs']['knowledge_base_id'] == knowledge_base_id
        assert call['kwargs']['model_config'] is None

    @pytest.mark.asyncio
    async def test_execute_with_model_config_passes_config(
        self, usecase, mock_rag_repository
    ):
        """モデル設定が指定された場合、リポジトリに正しく渡されることを確認"""
        # Arrange
        query = "テストクエリ"
        knowledge_base_id = "test-kb-123"
        model_config = {"temperature": 0.5, "maxTokens": 2048}
        expected_chunks = [RAGTestDataFactory.create_rag_stream_chunk_done()]
        
        async def mock_generator(*args, **kwargs):
            for chunk in expected_chunks:
                yield chunk
        
        # Create AsyncMock that tracks calls but returns the generator
        async_mock = AsyncMock()
        async_mock.side_effect = mock_generator
        mock_rag_repository.retrieve_and_generate = async_mock

        # Act
        result_chunks = []
        async for chunk in usecase.execute(query, knowledge_base_id, model_config):
            result_chunks.append(chunk)

        # Assert
        async_mock.assert_called_once_with(
            query=query,
            knowledge_base_id=knowledge_base_id,
            model_config=model_config,
        )

    @pytest.mark.asyncio
    async def test_execute_with_empty_query_yields_error_chunk(
        self, usecase, mock_rag_repository
    ):
        """空のクエリでエラーチャンクが生成されることを確認"""
        # Arrange
        query = ""  # 空のクエリ
        knowledge_base_id = "test-kb"

        # Act
        result_chunks = []
        async for chunk in usecase.execute(query, knowledge_base_id):
            result_chunks.append(chunk)

        # Assert
        assert len(result_chunks) == 1
        assert result_chunks[0].type == "error"
        assert "empty" in result_chunks[0].error.lower()
        mock_rag_repository.retrieve_and_generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_with_empty_knowledge_base_id_yields_error_chunk(
        self, usecase, mock_rag_repository
    ):
        """空のナレッジベースIDでエラーチャンクが生成されることを確認"""
        # Arrange
        query = "有効なクエリ"
        knowledge_base_id = ""  # 空のナレッジベースID

        # Act
        result_chunks = []
        async for chunk in usecase.execute(query, knowledge_base_id):
            result_chunks.append(chunk)

        # Assert
        assert len(result_chunks) == 1
        assert result_chunks[0].type == "error"
        assert "knowledge base" in result_chunks[0].error.lower()
        mock_rag_repository.retrieve_and_generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_with_repository_error_yields_error_chunk(
        self, usecase, mock_rag_repository
    ):
        """リポジトリでエラーが発生した場合、エラーチャンクが生成されることを確認"""
        # Arrange
        query = "テストクエリ"
        knowledge_base_id = "test-kb"
        async def mock_generator_with_error(*args, **kwargs):
            raise Exception("Knowledge base unavailable")
            yield  # This line is never reached but makes it a generator
        
        # Assign the generator function directly
        mock_rag_repository.retrieve_and_generate = mock_generator_with_error

        # Act
        result_chunks = []
        async for chunk in usecase.execute(query, knowledge_base_id):
            result_chunks.append(chunk)

        # Assert
        assert len(result_chunks) == 1
        assert result_chunks[0].type == "error"
        assert "Knowledge base unavailable" in result_chunks[0].error

    @pytest.mark.asyncio
    async def test_execute_with_system_prompt_enhances_query(
        self, usecase, mock_rag_repository
    ):
        """システムプロンプトが指定された場合、クエリが拡張されることを確認"""
        # Arrange
        query = "AWS Lambdaについて教えてください"
        knowledge_base_id = "test-kb"
        system_prompt = "あなたは技術文書の専門家です。"
        expected_chunks = [RAGTestDataFactory.create_rag_stream_chunk_done()]
        
        async def mock_generator(*args, **kwargs):
            for chunk in expected_chunks:
                yield chunk
        
        # Create AsyncMock that tracks calls but returns the generator
        async_mock = AsyncMock()
        async_mock.side_effect = mock_generator
        mock_rag_repository.retrieve_and_generate = async_mock

        # Act
        result_chunks = []
        async for chunk in usecase.execute(query, knowledge_base_id, None, system_prompt):
            result_chunks.append(chunk)

        # Assert
        async_mock.assert_called_once()
        call_args = async_mock.call_args
        enhanced_query = call_args.kwargs["query"]
        assert system_prompt in enhanced_query
        assert query in enhanced_query