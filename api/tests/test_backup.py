from __future__ import annotations

import gzip
import sqlite3
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from orbit.backup import (
    BackupError,
    backup_if_due,
    compress,
    is_backup_due,
    object_key,
    pg_dump_command,
    prune,
    run_backup,
    snapshot_postgres,
    snapshot_sqlite,
    sqlite_path,
)
from orbit.config import Settings
from orbit.db import create_db_engine
from tests.conftest import SECRET_KEY

NOW = datetime(2026, 11, 19, 4, 30, tzinfo=UTC)


class FakeS3:
    def __init__(self) -> None:
        self.objects: dict[str, datetime] = {}
        self.uploaded: dict[str, bytes] = {}
        self.deleted: list[str] = []

    def upload_file(self, filename: str, bucket: str, key: str) -> None:
        self.uploaded[key] = Path(filename).read_bytes()
        self.objects[key] = NOW

    def list_objects_v2(self, **kwargs: Any) -> dict[str, Any]:
        prefix = kwargs.get("Prefix", "")
        contents = [
            {"Key": key, "LastModified": modified}
            for key, modified in sorted(self.objects.items())
            if key.startswith(prefix)
        ]
        return {"Contents": contents, "IsTruncated": False}

    def delete_objects(self, **kwargs: Any) -> None:
        for entry in kwargs["Delete"]["Objects"]:
            self.deleted.append(entry["Key"])
            self.objects.pop(entry["Key"], None)


def settings_for(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": f"sqlite:///{tmp_path / 'orbit.db'}",
        "backup_s3_bucket": "orbit-backups",
        "backup_s3_prefix": "orbit/",
        "backup_keep_days": 14,
        "backup_hour_utc": 3,
    }
    values.update(overrides)
    return Settings(_env_file=None, secret_key=SECRET_KEY, base_url="https://orbit.test", **values)


def make_database(tmp_path: Path) -> Settings:
    settings = settings_for(tmp_path)
    engine = create_db_engine(settings.database_url)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)")
        connection.exec_driver_sql("INSERT INTO notes (body) VALUES ('kept safe')")
    engine.dispose()
    return settings


def test_only_sqlite_files_can_be_backed_up() -> None:
    with pytest.raises(BackupError):
        sqlite_path("postgresql://user:pw@host/db")
    with pytest.raises(BackupError):
        sqlite_path("sqlite://")
    with pytest.raises(BackupError):
        sqlite_path("sqlite:///:memory:")


def test_a_snapshot_is_a_consistent_copy_made_with_the_online_backup(tmp_path: Path) -> None:
    settings = make_database(tmp_path)
    live = create_db_engine(settings.database_url)
    live.connect().exec_driver_sql("SELECT 1")

    copy = snapshot_sqlite(settings.database_url, tmp_path / "copy.db")

    with sqlite3.connect(copy) as connection:
        assert connection.execute("SELECT body FROM notes").fetchall() == [("kept safe",)]
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    live.dispose()


def test_a_missing_database_is_reported(tmp_path: Path) -> None:
    settings = settings_for(tmp_path)

    with pytest.raises(BackupError):
        snapshot_sqlite(settings.database_url, tmp_path / "copy.db")


def test_the_snapshot_is_compressed(tmp_path: Path) -> None:
    settings = make_database(tmp_path)
    copy = snapshot_sqlite(settings.database_url, tmp_path / "copy.db")

    packed = compress(copy)

    assert packed.name == "copy.db.gz"
    assert gzip.decompress(packed.read_bytes()) == copy.read_bytes()


def test_keys_are_one_per_day_under_the_prefix(tmp_path: Path) -> None:
    settings = settings_for(tmp_path, backup_s3_prefix="prod/orbit/")

    assert object_key(settings, NOW) == "prod/orbit/orbit-20261119.db.gz"


def test_running_a_backup_uploads_a_restorable_copy_and_prunes_old_ones(tmp_path: Path) -> None:
    settings = make_database(tmp_path)
    s3 = FakeS3()
    s3.objects["orbit/orbit-20261001.db.gz"] = NOW - timedelta(days=40)
    s3.objects["orbit/orbit-20261110.db.gz"] = NOW - timedelta(days=9)
    s3.objects["orbit/notes.txt"] = NOW - timedelta(days=90)

    key = run_backup(settings, s3, NOW)

    assert key == "orbit/orbit-20261119.db.gz"
    restored = tmp_path / "restored.db"
    restored.write_bytes(gzip.decompress(s3.uploaded[key]))
    with sqlite3.connect(restored) as connection:
        assert connection.execute("SELECT body FROM notes").fetchall() == [("kept safe",)]
    assert s3.deleted == ["orbit/orbit-20261001.db.gz"]
    assert "orbit/notes.txt" in s3.objects
    assert "orbit/orbit-20261110.db.gz" in s3.objects


def test_fourteen_days_are_kept_by_default_and_the_edge_survives(tmp_path: Path) -> None:
    settings = settings_for(tmp_path)
    s3 = FakeS3()
    s3.objects["orbit/orbit-a.db.gz"] = NOW - timedelta(days=14, minutes=-1)
    s3.objects["orbit/orbit-b.db.gz"] = NOW - timedelta(days=14, minutes=1)

    removed = prune(s3, settings, NOW)

    assert removed == 1
    assert s3.deleted == ["orbit/orbit-b.db.gz"]


def test_backups_stay_off_until_a_bucket_is_named(tmp_path: Path) -> None:
    settings = settings_for(tmp_path, backup_s3_bucket="")

    with pytest.raises(BackupError):
        run_backup(settings, FakeS3(), NOW)
    assert backup_if_due(settings, FakeS3(), NOW) is None


@pytest.mark.parametrize(
    ("hour", "done", "due"),
    [(2, False, False), (3, False, True), (23, False, True), (3, True, False), (12, True, False)],
)
def test_the_nightly_backup_is_due_after_the_chosen_hour_once_a_day(
    tmp_path: Path, hour: int, done: bool, due: bool
) -> None:
    settings = settings_for(tmp_path)

    assert is_backup_due(settings, NOW.replace(hour=hour), done) is due


def test_a_backup_made_today_is_not_repeated_after_a_restart(tmp_path: Path) -> None:
    settings = make_database(tmp_path)
    s3 = FakeS3()

    first = backup_if_due(settings, s3, NOW)
    second = backup_if_due(settings, s3, NOW + timedelta(hours=3))
    next_day = backup_if_due(settings, s3, NOW + timedelta(days=1))

    assert first == "orbit/orbit-20261119.db.gz"
    assert second is None
    assert next_day == "orbit/orbit-20261120.db.gz"


POSTGRES_URL = "postgresql://orbit:s3cret@postgres.railway.internal:5432/railway"


def test_a_postgres_dump_command_keeps_the_password_off_the_command_line(tmp_path: Path) -> None:
    command, environment = pg_dump_command(POSTGRES_URL, tmp_path / "orbit.dump")

    assert command[0] == "pg_dump"
    assert "--format=custom" in command
    assert command[command.index("--host") + 1] == "postgres.railway.internal"
    assert command[command.index("--port") + 1] == "5432"
    assert command[command.index("--username") + 1] == "orbit"
    assert command[command.index("--dbname") + 1] == "railway"
    assert "s3cret" not in " ".join(command)
    assert environment["PGPASSWORD"] == "s3cret"


def test_postgres_keys_end_in_dump_and_are_pruned_with_the_rest(tmp_path: Path) -> None:
    settings = settings_for(tmp_path, database_url=POSTGRES_URL)
    s3 = FakeS3()
    s3.objects["orbit/orbit-20261001.dump"] = NOW - timedelta(days=40)
    s3.objects["orbit/orbit-20261001.db.gz"] = NOW - timedelta(days=40)

    assert object_key(settings, NOW) == "orbit/orbit-20261119.dump"
    assert prune(s3, settings, NOW) == 2


def test_a_postgres_backup_uploads_the_dump_as_it_is(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = settings_for(tmp_path, database_url=POSTGRES_URL)
    s3 = FakeS3()

    def fake_pg_dump(command: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        Path(command[command.index("--file") + 1]).write_bytes(b"PGDMP-bytes")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(subprocess, "run", fake_pg_dump)

    key = run_backup(settings, s3, NOW)

    assert key == "orbit/orbit-20261119.dump"
    assert s3.uploaded[key] == b"PGDMP-bytes"


def test_a_failing_pg_dump_is_reported_without_the_password(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing(command: list[str], **_: Any) -> None:
        raise subprocess.CalledProcessError(
            1, command, stderr="pg_dump: error: aborting because of server version mismatch"
        )

    monkeypatch.setattr(subprocess, "run", failing)

    with pytest.raises(BackupError, match="server version mismatch") as raised:
        snapshot_postgres(POSTGRES_URL, tmp_path / "orbit.dump")

    assert "s3cret" not in str(raised.value)


def test_a_missing_pg_dump_is_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def missing(command: list[str], **_: Any) -> None:
        raise FileNotFoundError("pg_dump")

    monkeypatch.setattr(subprocess, "run", missing)

    with pytest.raises(BackupError, match="not installed"):
        snapshot_postgres(POSTGRES_URL, tmp_path / "orbit.dump")
