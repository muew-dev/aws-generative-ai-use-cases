"""ドメインエラー定義

ErrorCode Enumベースの統一的な例外ハンドリングシステム
すべてのドメインエラーは DomainError を使用し、ErrorCodeで種別を識別する
"""

from enum import Enum
from typing import Any


class DomainErrorCode(Enum):
    """ドメインエラーコード列挙型

    新しいエラー種別は必ずここに追加する
    これにより、ハンドラー側でのmatch文で網羅性がチェックされる
    """

    # ユーザー関連エラー
    USER_NOT_FOUND = "USER_NOT_FOUND"

    # チャット関連エラー
    CHAT_NOT_FOUND = "CHAT_NOT_FOUND"
    CHAT_ACCESS_DENIED = "CHAT_ACCESS_DENIED"

    # メッセージ・コンテンツ関連エラー
    INVALID_MESSAGE_CONTENT = "INVALID_MESSAGE_CONTENT"

    # AI サービス関連エラー
    AI_SERVICE_ERROR = "AI_SERVICE_ERROR"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    MODEL_NOT_AVAILABLE = "MODEL_NOT_AVAILABLE"


class DomainError(Exception):
    """統一ドメインエラークラス

    ErrorCodeで種別を識別し、詳細情報をdetailsで保持する
    """

    def __init__(self, code: DomainErrorCode, message: str, **details: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    def __str__(self) -> str:
        return f"[{self.code.value}] {self.message}"


# ========================================
# ドメインエラー ファクトリーメソッド
# ========================================


class DomainErrors:
    """ドメインエラー生成のためのファクトリークラス

    各種エラーを統一的に生成し、ErrorCodeによる種別管理を行う
    """

    @staticmethod
    def user_not_found(user_id: str) -> DomainError:
        """ユーザーが見つからない場合のエラー"""
        return DomainError(
            code=DomainErrorCode.USER_NOT_FOUND,
            message=f"ユーザーが見つかりません: {user_id}",
            user_id=user_id,
        )

    @staticmethod
    def chat_not_found(chat_id: str) -> DomainError:
        """チャットが見つからない場合のエラー"""
        return DomainError(
            code=DomainErrorCode.CHAT_NOT_FOUND,
            message=f"チャットが見つかりません: {chat_id}",
            chat_id=chat_id,
        )

    @staticmethod
    def chat_access_denied(chat_id: str, user_id: str) -> DomainError:
        """チャットへのアクセスが拒否された場合のエラー"""
        return DomainError(
            code=DomainErrorCode.CHAT_ACCESS_DENIED,
            message=f"チャットへのアクセスが拒否されました。チャット: {chat_id}, ユーザー: {user_id}",
            chat_id=chat_id,
            user_id=user_id,
        )

    @staticmethod
    def invalid_message_content(message: str) -> DomainError:
        """メッセージの内容が無効な場合のエラー"""
        return DomainError(
            code=DomainErrorCode.INVALID_MESSAGE_CONTENT,
            message=f"無効なメッセージ内容: {message}",
        )

    @staticmethod
    def ai_service_error(message: str, cause: Exception | None = None) -> DomainError:
        """AI サービスでエラーが発生した場合のエラー"""
        return DomainError(
            code=DomainErrorCode.AI_SERVICE_ERROR,
            message=f"AI サービスエラー: {message}",
            cause=cause,
        )

    @staticmethod
    def rate_limit_exceeded() -> DomainError:
        """レート制限に達した場合のエラー"""
        return DomainError(
            code=DomainErrorCode.RATE_LIMIT_EXCEEDED,
            message="リクエスト制限に達しました。しばらく待ってから再試行してください",
        )

    @staticmethod
    def model_not_available(model_id: str | None = None) -> DomainError:
        """指定されたモデルが利用できない場合のエラー"""
        if model_id:
            message = f"指定されたモデルは利用できません: {model_id}"
            return DomainError(
                code=DomainErrorCode.MODEL_NOT_AVAILABLE,
                message=message,
                model_id=model_id,
            )
        else:
            return DomainError(
                code=DomainErrorCode.MODEL_NOT_AVAILABLE,
                message="指定されたモデルは利用できません",
            )


