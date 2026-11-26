from alembic import context

from orbit.db import create_db_engine
from orbit.models import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_online() -> None:
    engine = create_db_engine(config.get_main_option("sqlalchemy.url") or "")
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
                compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


run_migrations_online()
