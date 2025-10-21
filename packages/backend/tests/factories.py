"""テストデータファクトリー

テスト駆動開発（TDD）で使用するテストデータを一元管理
期待される入出力パターンを定義し、テストケースで再利用可能にする
"""

import json
from datetime import UTC, datetime
from typing import Any

from domain.entities.chat import Chat, ChatId
from domain.entities.message import ContentType, Message, MessageContent, MessageId, MessageRole, ModelConfig
from domain.entities.rag import RAGQuery, RAGResponse, RAGStreamChunk, RetrievedDocument
from domain.entities.user import User, UserId


class TestDataFactory:
    """テストデータ作成用ファクトリー
    
    TDDアプローチに従い、期待される入出力データを提供
    """
    
    @staticmethod
    def create_user(
        user_id: str = "test-user-123",
        email: str = "test@example.com",
        display_name: str = "Test User",
    ) -> User:
        """テスト用ユーザーを作成"""
        return User(
            id=UserId(user_id),
            email=email,
            display_name=display_name,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    
    @staticmethod
    def create_chat(
        chat_id: str = "test-chat-456",
        user_id: str = "test-user-123",
        title: str = "Test Chat",
        usecase: str = "chat",
    ) -> Chat:
        """テスト用チャットを作成"""
        return Chat.from_existing(
            chat_id=chat_id,
            user_id=user_id,
            title=title,
            usecase=usecase,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    
    @staticmethod
    def create_message_content(
        content_type: ContentType = ContentType.TEXT,
        body: str = "Test message content",
        media_type: str | None = None,
    ) -> MessageContent:
        """テスト用メッセージコンテンツを作成"""
        return MessageContent(
            content_type=content_type,
            body=body,
            media_type=media_type,
        )
    
    @staticmethod
    def create_message(
        message_id: str = "test-message-789",
        chat_id: str = "test-chat-456",
        user_id: str = "test-user-123",
        role: MessageRole = MessageRole.USER,
        content: list[MessageContent] | None = None,
    ) -> Message:
        """テスト用メッセージを作成"""
        if content is None:
            content = [TestDataFactory.create_message_content()]
        
        return Message.create(
            chat_id=ChatId(chat_id),
            user_id=UserId(user_id),
            role=role,
            content=content,
        )
    
    @staticmethod
    def create_model_config(
        model_id: str = "anthropic.claude-3-5-sonnet-20241022-v2:0",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        top_p: float = 0.9,
        stop_sequences: list[str] | None = None,
    ) -> ModelConfig:
        """テスト用モデル設定を作成"""
        return ModelConfig(
            model_id=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stop_sequences=stop_sequences,
        )


class RAGTestDataFactory:
    """RAG機能専用のテストデータファクトリー"""
    
    @staticmethod
    def create_rag_query(
        query: str = "AWS Bedrockの使い方を教えてください",
        knowledge_base_id: str = "test-kb-123",
        max_results: int = 5,
        confidence_threshold: float = 0.7,
    ) -> RAGQuery:
        """テスト用RAGクエリを作成
        
        期待される入力パターン:
        - 有効なクエリ文字列
        - 存在するナレッジベースID
        - 適切な閾値設定
        """
        return RAGQuery(
            query=query,
            knowledge_base_id=knowledge_base_id,
            max_results=max_results,
            confidence_threshold=confidence_threshold,
        )
    
    @staticmethod
    def create_retrieved_document(
        content: str = "AWS Bedrockは、基盤モデルを使用してAIアプリケーションを構築するためのフルマネージドサービスです。",
        source: str = "s3://test-bucket/docs/bedrock-guide.pdf",
        confidence_score: float = 0.85,
        metadata: dict[str, Any] | None = None,
    ) -> RetrievedDocument:
        """テスト用検索結果文書を作成
        
        期待される出力パターン:
        - 関連性の高いコンテンツ
        - 信頼できるソース情報
        - 閾値を超える信頼度スコア
        """
        if metadata is None:
            metadata = {
                "document_type": "pdf",
                "page_number": 1,
                "section": "introduction",
                "last_updated": "2024-01-15",
            }
        
        return RetrievedDocument(
            content=content,
            source=source,
            confidence_score=confidence_score,
            metadata=metadata,
        )
    
    @staticmethod
    def create_rag_response(
        query: str = "AWS Bedrockの使い方を教えてください",
        generated_answer: str = "AWS Bedrockを使用するには、まずAWSコンソールにログインし...",
        documents: list[RetrievedDocument] | None = None,
        session_id: str | None = "test-session-123",
    ) -> RAGResponse:
        """テスト用RAG応答を作成
        
        期待される出力パターン:
        - クエリに対する適切な回答
        - 関連文書の参照情報
        - セッションID
        """
        if documents is None:
            documents = [RAGTestDataFactory.create_retrieved_document()]
        
        return RAGResponse(
            query=query,
            generated_answer=generated_answer,
            documents=documents,
            session_id=session_id,
        )
    
    @staticmethod
    def create_rag_stream_chunk_token(
        token: str = "AWS",
    ) -> RAGStreamChunk:
        """テスト用RAGストリームチャンク（トークン）を作成"""
        return RAGStreamChunk(type="token", token=token)
    
    @staticmethod
    def create_rag_stream_chunk_retrieval(
        documents: list[RetrievedDocument] | None = None,
    ) -> RAGStreamChunk:
        """テスト用RAGストリームチャンク（検索結果）を作成"""
        if documents is None:
            documents = [RAGTestDataFactory.create_retrieved_document()]
        
        return RAGStreamChunk(type="retrieval", documents=documents)
    
    @staticmethod
    def create_rag_stream_chunk_metadata(
        metadata: dict[str, Any] | None = None,
    ) -> RAGStreamChunk:
        """テスト用RAGストリームチャンク（メタデータ）を作成"""
        if metadata is None:
            metadata = {
                "total_tokens": 150,
                "input_tokens": 50,
                "output_tokens": 100,
                "model_id": "anthropic.claude-3-5-sonnet-20241022-v1:0",
            }
        
        return RAGStreamChunk(type="metadata", metadata=metadata)
    
    @staticmethod
    def create_rag_stream_chunk_error(
        error: str = "Knowledge base not found",
    ) -> RAGStreamChunk:
        """テスト用RAGストリームチャンク（エラー）を作成"""
        return RAGStreamChunk(type="error", error=error)
    
    @staticmethod
    def create_rag_stream_chunk_done() -> RAGStreamChunk:
        """テスト用RAGストリームチャンク（完了）を作成"""
        return RAGStreamChunk(type="done")


class MockResponseFactory:
    """外部API応答のモック作成用ファクトリー"""
    
    @staticmethod
    def create_bedrock_retrieve_response() -> dict[str, Any]:
        """Bedrock Retrieve APIの応答をモック"""
        return {
            "retrievalResults": [
                {
                    "content": {
                        "text": "AWS Bedrockは、基盤モデルを使用してAIアプリケーションを構築するためのフルマネージドサービスです。"
                    },
                    "location": {
                        "type": "S3",
                        "s3Location": {
                            "uri": "s3://test-bucket/docs/bedrock-guide.pdf"
                        }
                    },
                    "score": 0.85,
                    "metadata": {
                        "document_type": "pdf",
                        "page_number": 1
                    }
                }
            ]
        }
    
    @staticmethod
    def create_bedrock_generate_stream_events() -> list[dict[str, Any]]:
        """Bedrock Generate Stream APIのイベントをモック"""
        return [
            {
                "chunk": {
                    "bytes": json.dumps({"completion": "AWS"}).encode()
                }
            },
            {
                "chunk": {
                    "bytes": json.dumps({"completion": " Bedrock"}).encode()
                }
            },
            {
                "chunk": {
                    "bytes": json.dumps({"completion": "を使用するには"}).encode()
                }
            },
            {
                "chunk": {
                    "bytes": json.dumps({
                        "citations": [
                            {
                                "retrievedReferences": [
                                    {
                                        "content": {"text": "AWS Bedrockガイド"},
                                        "location": {
                                            "s3Location": {
                                                "uri": "s3://test-bucket/docs/bedrock-guide.pdf"
                                            }
                                        },
                                        "metadata": {"page_number": 1}
                                    }
                                ]
                            }
                        ]
                    }).encode()
                }
            },
            {
                "metadata": {
                    "usage": {
                        "inputTokens": 50,
                        "outputTokens": 20,
                        "totalTokens": 70
                    }
                }
            }
        ]
    
    @staticmethod
    def create_bedrock_error_response() -> dict[str, Any]:
        """Bedrock APIのエラー応答をモック"""
        return {
            "Error": {
                "Code": "ValidationException",
                "Message": "Knowledge base not found"
            }
        }


class APIRequestFactory:
    """API リクエスト用のテストデータファクトリー"""
    
    @staticmethod
    def create_rag_retrieve_request() -> dict[str, Any]:
        """RAG文書検索APIのリクエストデータを作成"""
        return {
            "query": "AWS Bedrockの使い方を教えてください",
            "knowledgeBaseId": "test-kb-123",
            "maxResults": 5,
            "confidenceThreshold": 0.7,
        }
    
    @staticmethod
    def create_rag_chat_request() -> dict[str, Any]:
        """RAGチャットAPIのリクエストデータを作成"""
        return {
            "query": "AWS Bedrockの料金体系について教えてください",
            "knowledgeBaseId": "test-kb-123",
            "model": {
                "modelId": "anthropic.claude-3-5-sonnet-20241022-v1:0",
                "temperature": 0.7,
                "maxTokens": 4096,
            },
            "retrievalConfig": {
                "maxResults": 10,
                "confidenceThreshold": 0.8,
            }
        }
    
    @staticmethod
    def create_invalid_rag_request() -> dict[str, Any]:
        """無効なRAGリクエストデータを作成（バリデーションテスト用）"""
        return {
            "query": "",  # 空のクエリ
            "knowledgeBaseId": "",  # 空のナレッジベースID
            "maxResults": 0,  # 無効な結果数
            "confidenceThreshold": 1.5,  # 範囲外の閾値
        }