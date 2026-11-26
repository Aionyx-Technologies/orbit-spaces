from __future__ import annotations

import gzip
import logging
import os
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.engine import make_url

from orbit.config import Settings
from orbit.db import normalize_database_url
from orbit.timeutil import utcnow

logger = logging.getLogger("orbit.backup")

KEY_FORMAT = "orbit-%Y%m%d.db.gz"
POSTGRES_KEY_FORMAT = "orbit-%Y%m%d.dump"
BACKUP_SUFFIXES = (".db.gz", ".dump")
CHECK_INTERVAL_SECONDS = 900
PG_DUMP_TIMEOUT_SECONDS = 1800


class BackupError(Exception):
    pass


def sqlite_path(database_url: str) -> Path:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise BackupError("Backups are only available for a SQLite database file.")
    return Path(url.database).expanduser()


def snapshot_sqlite(database_url: str, destination: Path) -> Path:
    source_path = sqlite_path(database_url)
    if not source_path.exists():
        raise BackupError("The database file does not exist yet.")
    source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
    target = sqlite3.connect(destination)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    return destination


def is_postgres(database_url: str) -> bool:
    return normalize_database_url(database_url).get_backend_name() == "postgresql"


def pg_dump_command(database_url: str, destination: Path) -> tuple[list[str], dict[str, str]]:
    """The pg_dump command line and environment for a Postgres URL.

    The password goes in the environment, not the command line, so it does not show up in the
    process list.
    """
    url = normalize_database_url(database_url)
    if not url.database:
        raise BackupError("The database URL does not name a database.")
    command = ["pg_dump", "--format=custom", "--no-owner", "--file", str(destination)]
    if url.host:
        command += ["--host", url.host]
    if url.port:
        command += ["--port", str(url.port)]
    if url.username:
        command += ["--username", url.username]
    command += ["--dbname", url.database]
    environment = {**os.environ}
    if url.password:
        environment["PGPASSWORD"] = url.password
    return command, environment


def snapshot_postgres(database_url: str, destination: Path) -> Path:
    command, environment = pg_dump_command(database_url, destination)
    try:
        subprocess.run(  # noqa: S603 - fixed program name, arguments built from settings
            command,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
            timeout=PG_DUMP_TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        raise BackupError("pg_dump is not installed, so Postgres cannot be backed up.") from None
    except subprocess.TimeoutExpired:
        raise BackupError("pg_dump took too long and was stopped.") from None
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or "").strip().splitlines()
        raise BackupError(
            "pg_dump failed: " + (detail[-1] if detail else f"exit code {error.returncode}")
        ) from None
    return destination


def compress(path: Path) -> Path:
    compressed = path.with_suffix(path.suffix + ".gz")
    with path.open("rb") as raw, gzip.open(compressed, "wb", compresslevel=6) as packed:
        shutil.copyfileobj(raw, packed)
    return compressed


def object_key(settings: Settings, moment: datetime) -> str:
    key_format = POSTGRES_KEY_FORMAT if is_postgres(settings.database_url) else KEY_FORMAT
    return f"{settings.backup_s3_prefix}{moment.strftime(key_format)}"


def make_s3_client(settings: Settings) -> Any:
    import boto3

    options: dict[str, str] = {}
    if settings.backup_s3_endpoint_url:
        options["endpoint_url"] = settings.backup_s3_endpoint_url
    if settings.backup_s3_region:
        options["region_name"] = settings.backup_s3_region
    return boto3.client("s3", **options)


def exists(client: Any, bucket: str, key: str) -> bool:
    listing = client.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1)
    return any(entry["Key"] == key for entry in listing.get("Contents", []))


def prune(client: Any, settings: Settings, now: datetime) -> int:
    cutoff = now - timedelta(days=settings.backup_keep_days)
    doomed: list[dict[str, str]] = []
    token: str | None = None
    while True:
        arguments: dict[str, Any] = {
            "Bucket": settings.backup_s3_bucket,
            "Prefix": settings.backup_s3_prefix,
        }
        if token:
            arguments["ContinuationToken"] = token
        page = client.list_objects_v2(**arguments)
        doomed.extend(
            {"Key": entry["Key"]}
            for entry in page.get("Contents", [])
            if entry["Key"].endswith(BACKUP_SUFFIXES) and entry["LastModified"] < cutoff
        )
        if not page.get("IsTruncated"):
            break
        token = page.get("NextContinuationToken")
    for start in range(0, len(doomed), 1000):
        client.delete_objects(
            Bucket=settings.backup_s3_bucket,
            Delete={"Objects": doomed[start : start + 1000], "Quiet": True},
        )
    return len(doomed)


def run_backup(settings: Settings, client: Any | None = None, now: datetime | None = None) -> str:
    if not settings.backups_enabled:
        raise BackupError("Set BACKUP_S3_BUCKET to turn backups on.")
    moment = now or utcnow()
    s3 = client or make_s3_client(settings)
    key = object_key(settings, moment)
    with tempfile.TemporaryDirectory(prefix="orbit-backup-") as scratch:
        if is_postgres(settings.database_url):
            # pg_dump's custom format is already compressed.
            packed = snapshot_postgres(settings.database_url, Path(scratch) / "orbit.dump")
        else:
            snapshot = snapshot_sqlite(settings.database_url, Path(scratch) / "orbit.db")
            packed = compress(snapshot)
        s3.upload_file(str(packed), settings.backup_s3_bucket, key)
    removed = prune(s3, settings, moment)
    logger.info("Backup uploaded. Removed %d old backups.", removed)
    return key


def is_backup_due(settings: Settings, now: datetime, already_done_today: bool) -> bool:
    return (
        settings.backups_enabled and now.hour >= settings.backup_hour_utc and not already_done_today
    )


def backup_if_due(
    settings: Settings, client: Any | None = None, now: datetime | None = None
) -> str | None:
    if not settings.backups_enabled:
        return None
    moment = now or utcnow()
    s3 = client or make_s3_client(settings)
    done = exists(s3, settings.backup_s3_bucket, object_key(settings, moment))
    if not is_backup_due(settings, moment, done):
        return None
    return run_backup(settings, s3, moment)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    print(run_backup(settings))


if __name__ == "__main__":
    main()
