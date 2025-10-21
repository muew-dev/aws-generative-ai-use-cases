"""Application Settings"""

import json
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings"""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Database Configuration
    database_url: str = Field(
        default="postgresql://user:password@localhost:5432/app",
        description="PostgreSQL database URL",
    )

    # AWS Configuration
    aws_region: str = Field(default="ap-northeast-1", description="AWS region")
    bedrock_model_id: str = Field(
        default="anthropic.claude-3-5-sonnet-20240620-v1:0",
        description="Default Bedrock model ID",
    )

    # CORS Configuration
    allowed_origins: list[str] = Field(
        default=["*"], description="Allowed CORS origins"
    )

    # Development Configuration
    mock_alb_headers: str = Field(
        default="",
        description=(
            "Mock ALB headers as JSON string for development. "
            'Example: \'{"x-amzn-oidc-accesstoken":"mock-token","x-amzn-oidc-identity":"dev-user-123"}\''
        ),
    )

    def get_mock_headers(self) -> dict[str, str] | None:
        """Parse mock ALB headers JSON and return headers dict.

        Returns None if MOCK_ALB_HEADERS is not set.
        """
        if not self.mock_alb_headers.strip():
            return None

        try:
            parsed = json.loads(self.mock_alb_headers)
            # Ensure all values are strings
            if isinstance(parsed, dict):
                return {str(k): str(v) for k, v in parsed.items()}
            return None
        except json.JSONDecodeError:
            return None

    # Environment
    environment: str = Field(
        default="development", description="Application environment"
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings"""
    return Settings()
