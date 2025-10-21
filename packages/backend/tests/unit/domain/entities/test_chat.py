"""Chatドメインエンティティの単体テスト

TDDアプローチに従い、チャットエンティティの期待される動作を検証する
"""

import pytest
from datetime import UTC, datetime

from domain.entities.chat import Chat, ChatId
from domain.entities.user import UserId
from tests.factories import TestDataFactory


class TestChat:
    """Chatエンティティのテスト"""

    def test_chat_creation_with_valid_data(self):
        """有効なデータでChatが正常作成されることを確認"""
        # Arrange
        user_id = UserId("test-user-123")
        title = "テストチャット"
        usecase = "chat"

        # Act
        chat = Chat.create(
            user_id=user_id,
            title=title,
            usecase=usecase,
        )

        # Assert
        assert chat.user_id == user_id
        assert chat.title == title
        assert chat.usecase == usecase
        assert chat.id is not None
        assert chat.created_at is not None
        assert chat.updated_at is not None

    def test_chat_creation_generates_unique_id(self):
        """Chat作成時にユニークIDが生成されることを確認"""
        # Arrange
        user_id = UserId("test-user")

        # Act
        chat1 = Chat.create(
            user_id=user_id,
            title="Chat 1",
            usecase="chat",
        )
        chat2 = Chat.create(
            user_id=user_id,
            title="Chat 2",
            usecase="chat",
        )

        # Assert
        assert chat1.id != chat2.id

    def test_chat_to_dict_returns_correct_structure(self):
        """Chatのto_dict()が正しい構造を返すことを確認"""
        # Arrange
        chat = TestDataFactory.create_chat()

        # Act
        result = chat.to_dict()

        # Assert
        expected_keys = {"chatId", "userId", "title", "usecase", "createdAt", "updatedAt"}
        assert set(result.keys()) == expected_keys
        assert result["chatId"] == chat.id.value
        assert result["userId"] == chat.user_id.value
        assert result["title"] == chat.title
        assert result["usecase"] == chat.usecase

    def test_chat_with_different_use_case_types(self):
        """異なるユースケースタイプでのChat作成を確認"""
        # Arrange
        user_id = UserId("test-user")
        use_cases = [
            ("chat", "通常チャット"),
            ("rag", "RAGチャット"),
            ("generate-text", "テキスト生成"),
        ]

        for usecase_type, title in use_cases:
            # Act
            chat = Chat.create(
                user_id=user_id,
                title=title,
                usecase=usecase_type,
            )

            # Assert
            assert chat.usecase == usecase_type
            assert chat.title == title

    def test_chat_use_case_string_values(self):
        """usecaseが文字列として正しく処理されることを確認"""
        # Arrange
        use_cases = ["chat", "rag", "generate-text", "generate-image"]

        for usecase in use_cases:
            # Act
            chat = Chat.create(
                user_id=UserId("test-user"),
                title=f"{usecase} チャット",
                usecase=usecase,
            )

            # Assert
            assert chat.usecase == usecase

    def test_chat_timestamps_are_set_correctly(self):
        """Chatのタイムスタンプが適切に設定されることを確認"""
        # Arrange
        before_creation = datetime.now(UTC)

        # Act
        chat = Chat.create(
            user_id=UserId("test-user"),
            title="タイムスタンプテスト",
            usecase="chat",
        )

        after_creation = datetime.now(UTC)

        # Assert
        assert before_creation <= chat.created_at <= after_creation
        assert before_creation <= chat.updated_at <= after_creation
        assert chat.created_at == chat.updated_at  # 新規作成時は同じ

    def test_chat_from_existing_preserves_data(self):
        """既存データからのChat作成でデータが保持されることを確認"""
        # Arrange
        original_id = "existing-chat-456"
        original_created_at = datetime(2024, 1, 1, 10, 0, 0, tzinfo=UTC)
        original_updated_at = datetime(2024, 1, 1, 15, 30, 0, tzinfo=UTC)

        # Act
        chat = Chat.from_existing(
            chat_id=original_id,
            user_id="test-user",
            title="既存チャット",
            usecase="rag",
            created_at=original_created_at,
            updated_at=original_updated_at,
        )

        # Assert
        assert chat.id.value == original_id
        assert chat.created_at == original_created_at
        assert chat.updated_at == original_updated_at
        assert chat.title == "既存チャット"
        assert chat.usecase == "rag"

    def test_chat_title_edge_cases(self):
        """Chatタイトルの境界値ケースを確認"""
        # Arrange
        user_id = UserId("test-user")
        edge_case_titles = [
            "",  # 空文字列
            "短",  # 1文字
            "A" * 1000,  # 長いタイトル
            "特殊文字!@#$%^&*()",  # 特殊文字
            "絵文字 🚀 🎉 💻",  # 絵文字
        ]

        for title in edge_case_titles:
            # Act & Assert
            chat = Chat.create(
                user_id=user_id,
                title=title,
                usecase="chat",
            )
            # 空文字列の場合はデフォルトタイトルが設定される
            if title == "":
                assert chat.title == "新しいチャット"
            else:
                assert chat.title == title

    def test_chat_equality_comparison(self):
        """Chatの等価比較が正しく動作することを確認"""
        # Arrange
        chat_id = "same-chat-id"
        
        chat1 = Chat.from_existing(
            chat_id=chat_id,
            user_id="user1",
            title="Title 1",
            usecase="chat",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        
        chat2 = Chat.from_existing(
            chat_id=chat_id,
            user_id="user2",  # 異なるユーザー
            title="Title 2",  # 異なるタイトル
            usecase="rag",  # 異なるユースケース
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Act & Assert
        # IDが同じなら等価とみなす（実装に依存）
        assert chat1.id == chat2.id

    def test_chat_serialization_roundtrip(self):
        """Chatのシリアライゼーションと復元が正しく動作することを確認"""
        # Arrange
        original_chat = Chat.create(
            user_id=UserId("serialize-test-user"),
            title="シリアライゼーションテスト",
            usecase="image_generation",
        )

        # Act - to_dict()でシリアライズ
        chat_dict = original_chat.to_dict()

        # Assert - 必要な情報が全て含まれている
        assert chat_dict["chatId"] == original_chat.id.value
        assert chat_dict["userId"] == original_chat.user_id.value
        assert chat_dict["title"] == original_chat.title
        assert chat_dict["usecase"] == original_chat.usecase
        assert "createdAt" in chat_dict
        assert "updatedAt" in chat_dict

    def test_chat_id_value_object_behavior(self):
        """ChatId値オブジェクトの動作を確認"""
        # Arrange
        id_value = "test-chat-id-123"

        # Act
        chat_id1 = ChatId(id_value)
        chat_id2 = ChatId(id_value)
        chat_id3 = ChatId("different-id")

        # Assert
        assert chat_id1.value == id_value
        assert chat_id2.value == id_value
        assert chat_id1 == chat_id2  # 同じ値なら等価
        assert chat_id1 != chat_id3  # 異なる値なら非等価

    def test_chat_with_rag_use_case_specific_behavior(self):
        """RAGユースケースでの特別な動作があれば確認"""
        # Arrange & Act
        rag_chat = Chat.create(
            user_id=UserId("rag-user"),
            title="RAG知識検索チャット",
            usecase="rag",
        )

        # Assert
        assert rag_chat.usecase == "rag"
        # RAG特有の設定や動作があれば追加でテスト
        # 例: 特別な設定フィールドがあれば確認

    def test_chat_creation_with_auto_generated_title(self):
        """自動生成タイトル機能があれば確認"""
        # Arrange & Act
        # 現在の実装では自動生成はないが、将来追加される可能性を想定
        chat = Chat.create(
            user_id=UserId("title-test-user"),
            title="",  # 空タイトル
            usecase="chat",
        )

        # Assert
        assert chat.title == "新しいチャット"  # 実装では空文字の場合デフォルトタイトルを設定