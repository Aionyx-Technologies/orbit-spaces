from __future__ import annotations

from pathlib import Path
from types import TracebackType
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL, Connection, CursorResult, Result, make_url
from sqlalchemy.orm import Session, sessionmaker

SessionFactory = sessionmaker[Session]

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BEGIN_OPTION = "sqlite_begin"
BEGIN_MODES = frozenset({"IMMEDIATE", "DEFERRED"})


def rows_affected(result: Result[Any]) -> int:
    if not isinstance(result, CursorResult):
        raise TypeError("rows_affected needs the result of an INSERT, UPDATE or DELETE")
    return int(result.rowcount)


POSTGRES_POOL_SIZE = 5
POSTGRES_MAX_OVERFLOW = 5
POSTGRES_POOL_RECYCLE_SECONDS = 1800


def normalize_database_url(database_url: str) -> URL:
    """Parse a database URL, sending plain Postgres URLs to the psycopg 3 driver.

    Railway and most hosts hand out postgres:// or postgresql:// URLs, which SQLAlchemy would
    otherwise open with psycopg2.
    """
    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        return url.set(drivername="postgresql+psycopg")
    return url


def create_db_engine(database_url: str) -> Engine:
    url = normalize_database_url(database_url)
    is_sqlite = url.get_backend_name() == "sqlite"
    connect_args: dict[str, Any] = {}
    if is_sqlite:
        if url.database and url.database != ":memory:":
            Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        connect_args = {"check_same_thread": False, "timeout": 10}
    pool_options: dict[str, Any] = {}
    if not is_sqlite:
        pool_options = {
            "pool_size": POSTGRES_POOL_SIZE,
            "max_overflow": POSTGRES_MAX_OVERFLOW,
            "pool_recycle": POSTGRES_POOL_RECYCLE_SECONDS,
        }
    engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=not is_sqlite,
        hide_parameters=True,
        **pool_options,
    )
    if is_sqlite:
        _configure_sqlite(engine)
    return engine


def _configure_sqlite(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection: Any, _record: Any) -> None:
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=10000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    @event.listens_for(engine, "begin")
    def _on_begin(connection: Connection) -> None:
        mode = connection.get_execution_options().get(BEGIN_OPTION, "IMMEDIATE")
        connection.exec_driver_sql(f"BEGIN {mode if mode in BEGIN_MODES else 'IMMEDIATE'}")


def create_session_factory(engine: Engine) -> SessionFactory:
    return sessionmaker(bind=engine, expire_on_commit=False)


def create_read_session_factory(engine: Engine) -> SessionFactory:
    return sessionmaker(
        bind=engine.execution_options(**{BEGIN_OPTION: "DEFERRED"}), expire_on_commit=False
    )


class SessionScope:
    def __init__(self, factory: SessionFactory) -> None:
        self._factory = factory
        self._session: Session | None = None

    def __enter__(self) -> Session:
        self._session = self._factory()
        return self._session

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        session = self._session
        if session is None:
            return
        try:
            if exc_type is not None:
                session.rollback()
        finally:
            session.close()


def session_scope(factory: SessionFactory) -> SessionScope:
    return SessionScope(factory)


def run_migrations(database_url: str) -> None:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.upgrade(config, "head")
