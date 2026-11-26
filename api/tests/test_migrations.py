from __future__ import annotations

import json
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from orbit.db import PROJECT_ROOT, create_db_engine, run_migrations
from orbit.models import Base
from orbit.space_templates import read_stored_template


def alembic_config(url: str) -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def test_migrations_create_every_modelled_table(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'fresh.db'}"
    run_migrations(url)
    engine = create_db_engine(url)

    tables = set(sa.inspect(engine).get_table_names())

    assert {table.name for table in Base.metadata.sorted_tables} <= tables
    engine.dispose()


@pytest.mark.filterwarnings("ignore:Skipped unsupported reflection of expression-based index")
@pytest.mark.filterwarnings(
    "ignore:autogenerate skipping metadata-specified expression-based index"
)
def test_migrations_leave_no_drift_from_the_models(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'drift.db'}"
    run_migrations(url)
    engine = create_db_engine(url)

    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        differences = compare_metadata(context, Base.metadata)

    engine.dispose()
    assert differences == []


def test_migrations_can_be_rolled_back_and_reapplied(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'roundtrip.db'}"
    config = alembic_config(url)

    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    engine = create_db_engine(url)
    assert "items" in sa.inspect(engine).get_table_names()
    engine.dispose()


def test_the_database_runs_in_wal_mode_with_foreign_keys_on(tmp_path: Path) -> None:
    engine = create_db_engine(f"sqlite:///{tmp_path / 'pragmas.db'}")

    with engine.connect() as connection:
        journal = connection.exec_driver_sql("PRAGMA journal_mode").scalar_one()
        foreign_keys = connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one()
        busy = connection.exec_driver_sql("PRAGMA busy_timeout").scalar_one()

    engine.dispose()
    assert journal == "wal"
    assert foreign_keys == 1
    assert busy >= 5000


def test_existing_spaces_get_the_general_template_and_lose_nothing(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'upgrade.db'}"
    config = alembic_config(url)
    command.upgrade(config, "0001")
    engine = create_db_engine(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, display_name, created_at) "
            "VALUES ('u1', 'a@example.com', 'Alex', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO spaces (id, name, created_by, created_at) "
            "VALUES ('s1', 'Goa', 'u1', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO space_members (space_id, user_id, joined_at, notify_email) "
            "VALUES ('s1', 'u1', '2026-01-01 00:00:00', 1)"
        )
        connection.exec_driver_sql(
            "INSERT INTO memory (id, space_id, key, value, set_by, via, created_at) "
            "VALUES ('m1', 's1', 'Dates', 'Dec 20', 'u1', 'web', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO items (id, space_id, kind, title, content, author_kind, shared_by, via, "
            "created_at) VALUES ('i1', 's1', 'note', 'Hotels', 'Three', 'person', 'u1', 'web', "
            "'2026-01-01 00:00:00')"
        )
    engine.dispose()

    command.upgrade(config, "head")

    engine = create_db_engine(url)
    with engine.connect() as connection:
        template_id, raw = connection.exec_driver_sql(
            "SELECT template_id, template FROM spaces WHERE id = 's1'"
        ).one()
        counts = [
            connection.exec_driver_sql("SELECT count(*) FROM spaces").scalar_one(),
            connection.exec_driver_sql("SELECT count(*) FROM space_members").scalar_one(),
            connection.exec_driver_sql("SELECT count(*) FROM memory").scalar_one(),
            connection.exec_driver_sql("SELECT count(*) FROM items").scalar_one(),
        ]
    engine.dispose()
    template = read_stored_template(template_id, json.loads(raw))
    assert template_id == "general"
    assert template.id == "general"
    assert template.plan_sections == ("Summary", "Next steps", "To settle")
    assert template.facts == ()
    assert counts == [1, 1, 1, 1]


def test_a_space_inserted_without_a_template_gets_general_from_the_database(
    tmp_path: Path,
) -> None:
    url = f"sqlite:///{tmp_path / 'defaults.db'}"
    run_migrations(url)
    engine = create_db_engine(url)

    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO spaces (id, name, created_at) VALUES ('s2', 'Late', '2026-01-01 00:00:00')"
        )
        template_id = connection.exec_driver_sql(
            "SELECT template_id FROM spaces WHERE id = 's2'"
        ).scalar_one()

    engine.dispose()
    assert template_id == "general"


def test_existing_people_get_the_profile_defaults_and_lose_nothing(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'profile.db'}"
    config = alembic_config(url)
    command.upgrade(config, "0002")
    engine = create_db_engine(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, display_name, created_at) "
            "VALUES ('u1', 'a@example.com', 'Alex', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO web_sessions (token_hash, user_id, expires_at, created_at) "
            "VALUES ('h1', 'u1', '2026-12-01 00:00:00', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO spaces (id, name, created_by, created_at) "
            "VALUES ('s1', 'Goa', 'u1', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO space_members (space_id, user_id, joined_at, notify_email) "
            "VALUES ('s1', 'u1', '2026-01-01 00:00:00', 1)"
        )
    engine.dispose()

    command.upgrade(config, "head")

    engine = create_db_engine(url)
    with engine.connect() as connection:
        profile = connection.exec_driver_sql(
            "SELECT display_name, about, time_zone, email_frequency, default_space_id, "
            "avatar_updated_at FROM users WHERE id = 'u1'"
        ).one()
        user_agent = connection.exec_driver_sql(
            "SELECT user_agent FROM web_sessions WHERE token_hash = 'h1'"
        ).scalar_one()
        counts = [
            connection.exec_driver_sql("SELECT count(*) FROM spaces").scalar_one(),
            connection.exec_driver_sql("SELECT count(*) FROM space_members").scalar_one(),
            connection.exec_driver_sql("SELECT count(*) FROM web_sessions").scalar_one(),
        ]
    engine.dispose()
    assert tuple(profile) == ("Alex", "", "UTC", "instant", None, None)
    assert user_agent == ""
    assert counts == [1, 1, 1]


def test_a_photo_goes_when_its_person_goes(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'photo.db'}"
    run_migrations(url)
    engine = create_db_engine(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, display_name, created_at) "
            "VALUES ('u1', 'a@example.com', 'Alex', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO user_avatars (user_id, data, updated_at) "
            "VALUES ('u1', x'52494646', '2026-01-01 00:00:00')"
        )

    with engine.begin() as connection:
        connection.exec_driver_sql("DELETE FROM users WHERE id = 'u1'")
        remaining = connection.exec_driver_sql("SELECT count(*) FROM user_avatars").scalar_one()

    engine.dispose()
    assert remaining == 0


def test_existing_members_start_with_no_read_mark(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'readmark.db'}"
    config = alembic_config(url)
    command.upgrade(config, "0004")
    engine = create_db_engine(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, display_name, created_at) "
            "VALUES ('u1', 'a@example.com', 'Alex', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO spaces (id, name, created_by, created_at) "
            "VALUES ('s1', 'Goa trip', 'u1', '2026-01-01 00:00:00')"
        )
        connection.exec_driver_sql(
            "INSERT INTO space_members (space_id, user_id, joined_at, notify_email) "
            "VALUES ('s1', 'u1', '2026-01-01 00:00:00', 1)"
        )
    engine.dispose()

    command.upgrade(config, "head")

    engine = create_db_engine(url)
    with engine.connect() as connection:
        marks = connection.exec_driver_sql("SELECT last_read_at FROM space_members").all()
    engine.dispose()
    assert [tuple(mark) for mark in marks] == [(None,)]


@pytest.mark.filterwarnings("ignore:Skipped unsupported reflection of expression-based index")
def test_existing_facts_get_one_id_per_name_and_their_first_row_is_the_add(
    tmp_path: Path,
) -> None:
    url = f"sqlite:///{tmp_path / 'facts.db'}"
    config = alembic_config(url)
    command.upgrade(config, "0005")
    engine = create_db_engine(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, display_name, created_at) "
            "VALUES ('u1', 'a@example.com', 'Alex', '2026-01-01 00:00:00')"
        )
        connection.execute(
            sa.text(
                "INSERT INTO spaces (id, name, created_by, created_at) "
                "VALUES (:id, 'Goa', 'u1', '2026-01-01 00:00:00')"
            ),
            [{"id": "s1"}, {"id": "s2"}],
        )
        connection.execute(
            sa.text(
                "INSERT INTO memory (id, space_id, key, value, set_by, via, created_at, "
                "superseded_at) VALUES (:id, :space_id, :key, 'v', 'u1', 'web', :created, "
                ":superseded)"
            ),
            [
                {
                    "id": row_id,
                    "space_id": space_id,
                    "key": key,
                    "created": created,
                    "superseded": superseded,
                }
                for row_id, space_id, key, created, superseded in [
                    ("m1", "s1", "Budget", "2026-01-01 00:00:00", "2026-01-02 00:00:00"),
                    ("m2", "s1", "budget", "2026-01-02 00:00:00", "2026-01-03 00:00:00"),
                    ("m3", "s1", "Budget", "2026-01-03 00:00:00", None),
                    ("m4", "s1", "Dates", "2026-01-01 12:00:00", None),
                    ("m5", "s2", "Budget", "2026-01-01 00:00:00", None),
                ]
            ],
        )
    engine.dispose()

    command.upgrade(config, "head")

    engine = create_db_engine(url)
    with engine.connect() as connection:
        found = {
            row_id: (fact_id, action, previous_key)
            for row_id, fact_id, action, previous_key in connection.exec_driver_sql(
                "SELECT id, fact_id, action, previous_key FROM memory"
            ).all()
        }
        indexes = {index["name"] for index in sa.inspect(connection).get_indexes("memory")}
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql(
                "INSERT INTO memory (id, space_id, key, value, set_by, via, created_at, fact_id, "
                "action) VALUES ('m6', 's1', 'BUDGET', 'v', 'u1', 'web', "
                "'2026-01-04 00:00:00', 'f', 'add')"
            )
    engine.dispose()
    assert [found[row_id][1] for row_id in ("m1", "m2", "m3", "m4", "m5")] == [
        "add",
        "edit",
        "edit",
        "add",
        "add",
    ]
    assert found["m1"][0] == found["m2"][0] == found["m3"][0]
    assert len({found["m1"][0], found["m4"][0], found["m5"][0]}) == 3
    assert all(previous_key is None for _, _, previous_key in found.values())
    assert "ix_memory_space_fact" in indexes


@pytest.mark.filterwarnings("ignore:Skipped unsupported reflection of expression-based index")
@pytest.mark.filterwarnings(
    "ignore:autogenerate skipping metadata-specified expression-based index"
)
def test_migrations_leave_no_drift_on_the_configured_database(database_url: str) -> None:
    """Runs on whichever backend the suite is using, so CI checks Postgres too."""
    run_migrations(database_url)
    engine = create_db_engine(database_url)

    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        differences = compare_metadata(context, Base.metadata)

    engine.dispose()
    assert differences == []


def test_the_current_memory_key_index_is_partial_on_every_backend(database_url: str) -> None:
    run_migrations(database_url)
    engine = create_db_engine(database_url)
    lookup = {
        "sqlite": "SELECT sql FROM sqlite_master WHERE name = 'uq_memory_current_key'",
        "postgresql": "SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_memory_current_key'"
        " AND schemaname = current_schema()",
    }[engine.dialect.name]

    with engine.connect() as connection:
        definition = connection.execute(sa.text(lookup)).scalar_one()

    engine.dispose()
    assert "UNIQUE" in definition.upper()
    assert "superseded_at IS NULL" in definition
