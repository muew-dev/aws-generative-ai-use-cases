"""FastAPI Application Entry Point"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from application.di_container import DIContainer
from config.exception_handlers import (
    general_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from config.middleware import (
    AuthenticationMiddleware,
    RequestLoggingMiddleware,
)
from config.settings import get_settings
from routers.routes import create_routes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """FastAPI lifespan events"""

    # Initialize DI Container
    settings = get_settings()
    container = DIContainer(
        aws_region=settings.aws_region, bedrock_model_id=settings.bedrock_model_id
    )

    # Initialize database connection
    await container.initialize()

    app.state.container = container

    # Setup routes with initialized container

    routes = create_routes(container)
    app.include_router(routes)

    yield

    await container.cleanup()


def create_app() -> FastAPI:
    """Create FastAPI application with all configurations"""
    settings = get_settings()

    app = FastAPI(
        title="AWS Generative AI Use Cases API",
        version="1.0.0",
        description=(
            "Unified API for AWS Generative AI Use Cases - "
            "Chat, Message Management, and AI Streaming"
        ),
        lifespan=lifespan,
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )

    # Add middleware (order matters - last added = first executed)

    # CORS middleware (applied last)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Authentication middleware
    app.add_middleware(AuthenticationMiddleware)

    # Request logging middleware (applied first)
    app.add_middleware(RequestLoggingMiddleware)

    # Add exception handlers
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)

    return app


# Create the FastAPI app instance
app = create_app()
