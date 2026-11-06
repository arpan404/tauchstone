"""FastAPI dependencies: repository, session store, engine factory (overridable)."""

from __future__ import annotations

from functools import lru_cache

from app.services import engine_adapter
from app.services.repository import MockRepository, ParquetRepository, Repository
from app.services.sessions import SessionStore
from app.settings import settings


@lru_cache(maxsize=1)
def get_session_store() -> SessionStore:
    return SessionStore()


def get_repository() -> Repository:
    if settings.mock:
        return MockRepository()
    return ParquetRepository(settings.data_dir / "processed")


def get_engine_factory():
    return engine_adapter.create_attack_session
