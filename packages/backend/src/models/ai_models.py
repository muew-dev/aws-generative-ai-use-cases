"""AI サービスモデル

特定のプロバイダーに依存しないAIサービス相互作用のための抽象モデル
"""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from models.message import MessageContent


@dataclass(frozen=True)
class AIMessage(ABC):
    """AIサービスメッセージモデル(プロバイダー非依存)

    抽象クラス: 具象実装はinfrastructure層で行う
    """

    role: str
    content: list[MessageContent]

    @abstractmethod
    def to_provider_format(self) -> Any:
        """特定のAIプロバイダーフォーマットに変換"""
        pass


@dataclass(frozen=True)
class AIMessageList(ABC):
    """AIメッセージのコレクション(プロバイダー非依存)"""

    messages: Sequence[AIMessage]

    @abstractmethod
    def to_provider_format(self) -> Any:
        """全メッセージを特定のAIプロバイダーフォーマットに変換"""
        pass

    @classmethod
    @abstractmethod
    def from_domain_messages(cls, messages: list[Any]) -> "AIMessageList":
        """検証済みドメインメッセージから作成"""
        pass


@dataclass(frozen=True)
class AIStreamMetadata:
    """AIサービスストリーミングレスポンスのメタデータ(プロバイダー非依存)"""

    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
