"""FastAPI Middleware

Authentication and CORS middleware for Lambda@Edge + CloudFront + ALB + ECS architecture
"""

import datetime
from collections.abc import Callable
from typing import Any

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from config.settings import get_settings


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """Authentication middleware for Lambda@Edge + CloudFront architecture"""

    def __init__(self, app: Any) -> None:
        super().__init__(app)
        self.settings = get_settings()

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Any]
    ) -> Any:
        """Process authentication for each request"""
        # Skip auth for health endpoints
        if request.url.path.startswith("/api/health"):
            request.state.user = None
            return await call_next(request)

        # Check if endpoint requires authentication
        if self._is_public_endpoint(request):
            # Public endpoints don't require authentication
            request.state.user = None
            return await call_next(request)

        # Inject mock ALB headers for development mode
        if self.settings.get_mock_headers():
            self._inject_mock_alb_headers(request)

        # Authentication using ALB OIDC headers
        user = self._authenticate_request(request)

        # Check authentication requirements based on endpoint
        if self._requires_auth(request):
            # Cognito authentication required
            if not user or not user.get("userId"):
                from fastapi.responses import JSONResponse

                return JSONResponse(
                    status_code=401,
                    content={
                        "error": {
                            "code": "UNAUTHORIZED",
                            "message": "Cognito authentication required",
                        },
                        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                    },
                )

        request.state.user = user
        return await call_next(request)

    def _authenticate_request(self, request: Request) -> dict[str, str] | None:
        """Authenticate request using ALB Cognito OIDC headers"""

        # ALB Cognito OIDC authentication headers (primary method)
        # ALB sets these headers after Cognito OIDC validation
        access_token = request.headers.get("x-amzn-oidc-accesstoken", "").strip()
        identity = request.headers.get("x-amzn-oidc-identity", "").strip()

        if access_token and identity:
            # Basic input validation for identity (should not be empty or whitespace)
            if len(identity) > 0 and len(identity) <= 255:
                return {
                    "userId": identity,
                    "authType": "alb-cognito",
                }

        # JWT Bearer token authentication (development fallback)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return {
                "userId": "dev-bearer-user",
                "authType": "bearer-dev",
            }

        return None

    def _is_public_endpoint(self, request: Request) -> bool:
        """Check if endpoint is public (no authentication required)"""
        public_paths = [
            "/api/health",
            "/api/health/detailed",
        ]
        return request.url.path in public_paths

    def _requires_auth(self, request: Request) -> bool:
        """Check if endpoint requires authentication"""
        # All paths except public endpoints require authentication
        return not self._is_public_endpoint(request)

    def _inject_mock_alb_headers(self, request: Request) -> None:
        """Inject mock ALB headers for development mode"""
        mock_headers = self.settings.get_mock_headers()
        if mock_headers:
            # Inject headers into the request
            for key, value in mock_headers.items():
                # Use Starlette's MutableHeaders to modify headers
                try:
                    # Access the internal list directly (Starlette's approach)
                    if hasattr(request, "scope") and "headers" in request.scope:
                        request.scope["headers"].append(
                            (key.lower().encode(), value.encode())
                        )
                    elif hasattr(request.headers, "_list"):
                        request.headers._list.append(
                            (key.lower().encode(), value.encode())
                        )
                except (AttributeError, TypeError):
                    # Skip header injection if not possible
                    pass


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Request logging middleware"""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Any]
    ) -> Any:
        """Log request details"""
        import datetime

        start_time = datetime.datetime.now(datetime.UTC)

        # Log request
        print(f"{start_time.isoformat()} {request.method} {request.url}")

        # Process request
        response = await call_next(request)

        # Log response
        end_time = datetime.datetime.now(datetime.UTC)
        duration = (end_time - start_time).total_seconds() * 1000  # ms

        print(f"Response: {response.status_code} ({duration:.2f}ms)")

        return response
