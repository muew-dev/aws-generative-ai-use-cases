"""FastAPI Exception Handlers

Global exception handlers for consistent error responses
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from schemas.responses.message_responses import (
    ErrorDetail,
    ErrorResponse,
)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTPException with structured error response"""
    error_detail = ErrorDetail(
        code=_get_error_code(exc.status_code),
        message=str(exc.detail),
        details=None,
    )

    error_response = ErrorResponse(
        error=error_detail,
        timestamp=datetime.now(UTC).isoformat(),
        request_id=str(uuid.uuid4()),
    )

    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump(),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle validation errors with structured response"""
    error_detail = ErrorDetail(
        code="VALIDATION_ERROR",
        message="Request validation failed",
        details=str({"validation_errors": str(exc)}),
    )

    error_response = ErrorResponse(
        error=error_detail,
        timestamp=datetime.now(UTC).isoformat(),
        request_id=str(uuid.uuid4()),
    )

    return JSONResponse(
        status_code=422,
        content=error_response.model_dump(),
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions with structured response"""
    error_detail = ErrorDetail(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred",
        details=str({"type": exc.__class__.__name__})
        if exc.__class__.__name__
        else None,
    )

    error_response = ErrorResponse(
        error=error_detail,
        timestamp=datetime.now(UTC).isoformat(),
        request_id=str(uuid.uuid4()),
    )

    return JSONResponse(
        status_code=500,
        content=error_response.model_dump(),
    )


def _get_error_code(status_code: int) -> str:
    """Get error code based on HTTP status code"""
    error_codes = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        500: "INTERNAL_SERVER_ERROR",
        502: "EXTERNAL_SERVICE_ERROR",
        503: "SERVICE_UNAVAILABLE",
    }
    return error_codes.get(status_code, "UNKNOWN_ERROR")
