"""Common Response Models

Type-safe response models used across multiple API endpoints.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ErrorDetail:
    """Error detail response"""

    message: str
    type: str = "error"
    code: str | None = None
    details: str | None = None


@dataclass(frozen=True)
class ErrorResponse:
    """Error response"""

    error: ErrorDetail
    timestamp: str | None = None
    request_id: str | None = None

    def model_dump(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "error": self.error,
            "timestamp": self.timestamp,
            "request_id": self.request_id,
        }


@dataclass(frozen=True)
class ValidationErrorResponse:
    """Validation error response"""

    detail: list[ErrorDetail]


@dataclass(frozen=True)
class HealthData:
    """Health check response"""

    status: str

    @classmethod
    def create(
        cls, status: str, version: str | None = None, **kwargs: Any
    ) -> "HealthData":
        """Create health data response"""
        return cls(status=status)


@dataclass(frozen=True)
class DetailedHealthData:
    """Detailed health check response"""

    status: str
    version: str
    uptime: float

    @classmethod
    def create(
        cls,
        status: str,
        version: str = "1.0.0",
        uptime: float = 0.0,
        services: Any = None,
        **kwargs: Any,
    ) -> "DetailedHealthData":
        """Create detailed health data response"""
        return cls(status=status, version=version, uptime=uptime)


# SSE Event models
@dataclass(frozen=True)
class SSETokenEvent:
    """SSE token event"""

    type: str = "token"
    token: str = ""

    def model_dump(self) -> dict[str, str]:
        """Convert to dictionary for JSON serialization"""
        return {"type": self.type, "token": self.token}


@dataclass(frozen=True)
class SSEMetadataEvent:
    """SSE metadata event"""

    type: str = "metadata"
    metadata: dict[str, str] | None = None

    def model_dump(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {"type": self.type, "metadata": self.metadata}


@dataclass(frozen=True)
class SSEErrorEvent:
    """SSE error event"""

    type: str = "error"
    error: str = ""

    def model_dump(self) -> dict[str, str]:
        """Convert to dictionary for JSON serialization"""
        return {"type": self.type, "error": self.error}


@dataclass(frozen=True)
class SSEDoneEvent:
    """SSE done event"""

    type: str = "done"

    def model_dump(self) -> dict[str, str]:
        """Convert to dictionary for JSON serialization"""
        return {"type": self.type}