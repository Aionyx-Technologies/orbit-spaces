from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from orbit.backup import CHECK_INTERVAL_SECONDS as BACKUP_CHECK_SECONDS
from orbit.backup import backup_if_due
from orbit.config import Settings
from orbit.db import SessionFactory, session_scope
from orbit.limits import DAILY_CHECK_SECONDS, NOTIFY_TICK_SECONDS
from orbit.services.context import Env
from orbit.services.janitor import run_cleanup

logger = logging.getLogger("orbit.background")

CLEANUP_INTERVAL_SECONDS = 3600


async def run_periodically(
    job: Callable[[], object],
    interval_seconds: float,
    description: str,
    *,
    first_run_now: bool = False,
) -> None:
    if not first_run_now:
        await asyncio.sleep(interval_seconds)
    while True:
        try:
            await asyncio.to_thread(job)
        except Exception:
            logger.exception("%s failed.", description)
        await asyncio.sleep(interval_seconds)


def start_background_tasks(
    settings: Settings, env: Env, session_factory: SessionFactory
) -> list[asyncio.Task[None]]:
    def cleanup() -> None:
        with session_scope(session_factory) as db:
            run_cleanup(db, env)

    def flush_notifications() -> None:
        env.notifier.flush_due(session_factory)

    def flush_daily_summaries() -> None:
        env.notifier.flush_daily(session_factory)

    def backup() -> None:
        if backup_if_due(settings):
            logger.info("The nightly backup is stored.")

    tasks = [
        asyncio.create_task(env.mailer.run()),
        asyncio.create_task(run_periodically(cleanup, CLEANUP_INTERVAL_SECONDS, "Routine cleanup")),
        asyncio.create_task(
            run_periodically(flush_notifications, NOTIFY_TICK_SECONDS, "Sending activity emails")
        ),
        asyncio.create_task(
            run_periodically(flush_daily_summaries, DAILY_CHECK_SECONDS, "Sending daily summaries")
        ),
    ]
    if settings.backups_enabled:
        tasks.append(
            asyncio.create_task(
                run_periodically(
                    backup, BACKUP_CHECK_SECONDS, "The nightly backup", first_run_now=True
                )
            )
        )
    return tasks


async def stop_background_tasks(
    tasks: list[asyncio.Task[None]], env: Env, session_factory: SessionFactory
) -> None:
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await asyncio.to_thread(env.notifier.flush_due, session_factory, True, ignore_allowance=True)
    await asyncio.to_thread(env.mailer.drain)
