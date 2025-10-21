"""Prisma Client Configuration

Database connection and Prisma client setup
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from prisma import Prisma

from config.settings import get_settings


class PrismaClient:
    """Prisma client wrapper with connection management"""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: Prisma | None = None

    async def connect(self) -> None:
        """Connect to database"""
        if self._client is None:
            self._client = Prisma(datasource={"url": self.settings.database_url})

        if not self._client.is_connected():
            await self._client.connect()

    async def disconnect(self) -> None:
        """Disconnect from database"""
        if self._client and self._client.is_connected():
            await self._client.disconnect()

    @property
    def client(self) -> Prisma:
        """Get Prisma client instance"""
        if not self._client:
            raise RuntimeError("Prisma client not initialized. Call connect() first.")
        return self._client

    @asynccontextmanager
    async def transaction(self) -> AsyncGenerator[Prisma]:
        """Get transaction context"""
        async with self.client.tx() as transaction:
            yield transaction


# Global Prisma client instance
prisma_client = PrismaClient()
