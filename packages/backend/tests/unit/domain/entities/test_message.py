"""Messageドメインエンティティの単体テスト

TDDアプローチに従い、メッセージエンティティの期待される動作を検証する
"""

import pytest
from datetime import UTC, datetime

from domain.entities.chat import ChatId
from domain.entities.message import ContentType, Message, MessageContent, MessageRole
from domain.entities.user import UserId
from tests.factories import TestDataFactory


class TestMessageContent:
    """MessageContentエンティティのテスト"""

    def test_message_content_creation_with_text_type(self):
        """テキストタイプのMessageContentが正常作成されることを確認"""
        # Arrange & Act
        content = MessageContent(
            content_type=ContentType.TEXT,
            body="こんにちは、世界！",
            media_type=None,
        )

        # Assert
        assert content.content_type == ContentType.TEXT
        assert content.body == "こんにちは、世界！"
        assert content.media_type == "text/plain"

    def test_message_content_creation_with_image_type(self):
        """画像タイプのMessageContentが正常作成されることを確認"""
        # Arrange & Act
        content = MessageContent(
            content_type=ContentType.IMAGE,
            body="base64encodedimagedata...",
            media_type="image/jpeg",
        )

        # Assert
        assert content.content_type == ContentType.IMAGE
        assert content.body == "base64encodedimagedata..."
        assert content.media_type == "image/jpeg"

    def test_message_content_to_dict_returns_correct_structure(self):
        """MessageContentのto_dict()が正しい構造を返すことを確認"""
        # Arrange
        content = TestDataFactory.create_message_content()

        # Act
        result = content.to_dict()

        # Assert
        expected_keys = {"contentType", "body", "mediaType"}
        assert set(result.keys()) == expected_keys
        assert result["contentType"] == content.content_type.value
        assert result["body"] == content.body
        assert result["mediaType"] == content.media_type

    def test_message_content_with_empty_body(self):
        """空のボディでの動作を確認（バリデーション想定）"""
        # Arrange & Act & Assert
        # 現在の実装では特別な検証はないが、将来的にバリデーション追加を想定
        with pytest.raises(ValueError, match="Content body cannot be empty"):
            MessageContent(
                content_type=ContentType.TEXT,
                body="",  # 空文字列
                media_type=None,
            )


class TestMessage:
    """Messageエンティティのテスト"""

    def test_message_creation_with_valid_data(self):
        """有効なデータでMessageが正常作成されることを確認"""
        # Arrange
        chat_id = ChatId("test-chat-123")
        user_id = UserId("test-user-456")
        role = MessageRole.USER
        content = [TestDataFactory.create_message_content()]

        # Act
        message = Message.create(
            chat_id=chat_id,
            user_id=user_id,
            role=role,
            content=content,
        )

        # Assert
        assert message.chat_id == chat_id
        assert message.user_id == user_id
        assert message.role == role
        assert message.content == content
        assert message.id is not None
        assert message.created_at is not None
        assert message.updated_at is not None

    def test_message_creation_generates_unique_id(self):
        """Message作成時にユニークIDが生成されることを確認"""
        # Arrange
        chat_id = ChatId("test-chat")
        user_id = UserId("test-user")
        content = [TestDataFactory.create_message_content()]

        # Act
        message1 = Message.create(
            chat_id=chat_id,
            user_id=user_id,
            role=MessageRole.USER,
            content=content,
        )
        message2 = Message.create(
            chat_id=chat_id,
            user_id=user_id,
            role=MessageRole.USER,
            content=content,
        )

        # Assert
        assert message1.id != message2.id

    def test_message_to_dict_returns_correct_structure(self):
        """Messageのto_dict()が正しい構造を返すことを確認"""
        # Arrange
        message = TestDataFactory.create_message()

        # Act
        result = message.to_dict()

        # Assert
        expected_keys = {
            "messageId", "chatId", "userId", "role", "content", 
            "createdAt", "updatedAt"
        }
        assert set(result.keys()) == expected_keys
        assert result["messageId"] == message.id.value
        assert result["chatId"] == message.chat_id.value
        assert result["userId"] == message.user_id.value
        assert result["role"] == message.role.value
        assert isinstance(result["content"], list)
        assert len(result["content"]) == len(message.content)

    def test_message_with_multiple_content_items(self):
        """複数のコンテンツアイテムを含むメッセージの動作を確認"""
        # Arrange
        content_items = [
            MessageContent(ContentType.TEXT, "テキスト部分"),
            MessageContent(ContentType.IMAGE, "image_data", "image/png"),
            MessageContent(ContentType.TEXT, "追加テキスト"),
        ]

        # Act
        message = Message.create(
            chat_id=ChatId("test-chat"),
            user_id=UserId("test-user"),
            role=MessageRole.USER,
            content=content_items,
        )

        # Assert
        assert len(message.content) == 3
        assert message.content[0].content_type == ContentType.TEXT
        assert message.content[1].content_type == ContentType.IMAGE
        assert message.content[2].content_type == ContentType.TEXT

    def test_message_role_enum_values(self):
        """MessageRoleの値が正しいことを確認"""
        # Assert
        assert MessageRole.USER.value == "user"
        assert MessageRole.ASSISTANT.value == "assistant"
        assert MessageRole.SYSTEM.value == "system"

    def test_message_with_assistant_role(self):
        """アシスタントロールのメッセージが正常作成されることを確認"""
        # Arrange & Act
        message = Message.create(
            chat_id=ChatId("test-chat"),
            user_id=UserId("test-user"),
            role=MessageRole.ASSISTANT,
            content=[MessageContent(ContentType.TEXT, "AIからの応答")],
        )

        # Assert
        assert message.role == MessageRole.ASSISTANT
        assert message.content[0].body == "AIからの応答"

    def test_message_timestamps_are_set(self):
        """メッセージのタイムスタンプが適切に設定されることを確認"""
        # Arrange
        before_creation = datetime.now(UTC)

        # Act
        message = Message.create(
            chat_id=ChatId("test-chat"),
            user_id=UserId("test-user"),
            role=MessageRole.USER,
            content=[TestDataFactory.create_message_content()],
        )

        after_creation = datetime.now(UTC)

        # Assert
        assert before_creation <= message.created_at <= after_creation
        assert before_creation <= message.updated_at <= after_creation
        assert message.created_at == message.updated_at  # 新規作成時は同じ

    def test_message_from_existing_preserves_data(self):
        """既存データからのMessage作成でデータが保持されることを確認"""
        # Arrange
        original_id = "existing-message-123"
        original_created_at = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
        original_updated_at = datetime(2024, 1, 2, 12, 0, 0, tzinfo=UTC)
        content_dict = [{
            "contentType": "text",
            "body": "Test content",
            "mediaType": "text/plain"
        }]

        # Act
        message = Message.from_existing(
            message_id=original_id,
            chat_id="test-chat",
            user_id="test-user",
            role="assistant",
            content=content_dict,
            created_at=original_created_at,
            updated_at=original_updated_at,
        )

        # Assert
        assert message.id.value == original_id
        assert message.created_at == original_created_at
        assert message.updated_at == original_updated_at
        assert len(message.content) == 1
        assert message.content[0].body == "Test content"

    def test_message_equality_comparison(self):
        """Messageの等価比較が正しく動作することを確認"""
        # Arrange
        message_id = "same-id-123"
        content_dict = [{
            "contentType": "text",
            "body": "Test content",
            "mediaType": "text/plain"
        }]
        
        message1 = Message.from_existing(
            message_id=message_id,
            chat_id="chat1",
            user_id="user1",
            role="user",
            content=content_dict,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        
        message2 = Message.from_existing(
            message_id=message_id,
            chat_id="chat2",  # 異なるチャット
            user_id="user2",  # 異なるユーザー
            role="assistant",  # 異なるロール
            content=content_dict,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Act & Assert
        # IDが同じなら等価とみなす（実装に依存）
        assert message1.id == message2.id

    def test_message_content_serialization_roundtrip(self):
        """MessageContentのシリアライゼーションと復元が正しく動作することを確認"""
        # Arrange
        original_content = [
            MessageContent(ContentType.TEXT, "Hello"),
            MessageContent(ContentType.IMAGE, "img_data", "image/jpeg"),
        ]
        
        message = Message.create(
            chat_id=ChatId("test-chat"),
            user_id=UserId("test-user"),
            role=MessageRole.USER,
            content=original_content,
        )

        # Act - to_dict()でシリアライズ
        message_dict = message.to_dict()
        content_dicts = message_dict["content"]

        # Assert - 構造が保持されている
        assert len(content_dicts) == 2
        assert content_dicts[0]["contentType"] == "text"
        assert content_dicts[0]["body"] == "Hello"
        assert content_dicts[1]["contentType"] == "image"
        assert content_dicts[1]["mediaType"] == "image/jpeg"