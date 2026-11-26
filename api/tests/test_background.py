from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import pytest

from orbit.background import run_periodically, start_background_tasks, stop_background_tasks
from orbit.config import Settings
from orbit.db import SessionFactory
from orbit.services.context import Env
from tests.conftest import SECRET_KEY, RecordingSender

pytestmark = pytest.mark.anyio


async def test_a_job_runs_on_its_interval_and_a_failure_does_not_stop_it(
    caplog: pytest.LogCaptureFixture,
) -> None:
    runs: list[int] = []

    def flaky() -> None:
        runs.append(len(runs))
        if len(runs) == 1:
            raise RuntimeError("first run explodes")

    with caplog.at_level(logging.ERROR, logger="orbit.background"):
        task = asyncio.create_task(run_periodically(flaky, 0.02, "A test job", first_run_now=True))
        await asyncio.sleep(0.2)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert len(runs) >= 3
    assert "A test job failed." in caplog.text


async def test_a_job_waits_one_interval_before_its_first_run_by_default() -> None:
    runs: list[int] = []
    task = asyncio.create_task(run_periodically(lambda: runs.append(1), 0.2, "Slow start"))

    await asyncio.sleep(0.05)
    early = list(runs)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert early == []


async def test_the_standard_tasks_start_and_stop_cleanly_and_flush_on_the_way_out(
    env: Env, session_factory: SessionFactory
) -> None:
    recorder = RecordingSender()
    env.mailer.sender = recorder
    tasks = start_background_tasks(env.settings, env, session_factory)

    assert len(tasks) == 4
    assert not any(task.done() for task in tasks)
    await stop_background_tasks(tasks, env, session_factory)

    assert all(task.done() for task in tasks)


async def test_backups_get_their_own_task_only_when_a_bucket_is_named(
    tmp_path: Path, env: Env, session_factory: SessionFactory
) -> None:
    with_backups = Settings(
        _env_file=None,
        secret_key=SECRET_KEY,
        base_url="https://orbit.test",
        database_url=f"sqlite:///{tmp_path / 'orbit.db'}",
        backup_s3_bucket="some-bucket",
    )
    tasks = start_background_tasks(with_backups, env, session_factory)

    assert len(tasks) == 5
    await stop_background_tasks(tasks, env, session_factory)
