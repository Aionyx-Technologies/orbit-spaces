from __future__ import annotations

from datetime import UTC, datetime

MINUTE = 60
HOUR = 60 * MINUTE
DAY = 24 * HOUR
WEEK = 7 * DAY
MONTH = 30 * DAY
YEAR = 365 * DAY


def utcnow() -> datetime:
    return datetime.now(UTC)


def isoformat_z(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _plural(count: int, unit: str) -> str:
    return f"{count} {unit}" if count == 1 else f"{count} {unit}s"


def relative_age(then: datetime, now: datetime) -> str:
    seconds = int((now - then).total_seconds())
    if seconds < MINUTE:
        return "just now"
    if seconds < HOUR:
        return f"{_plural(seconds // MINUTE, 'minute')} ago"
    if seconds < DAY:
        return f"{_plural(seconds // HOUR, 'hour')} ago"
    if seconds < 2 * WEEK:
        return f"{_plural(seconds // DAY, 'day')} ago"
    if seconds < 2 * MONTH:
        return f"{_plural(seconds // WEEK, 'week')} ago"
    if seconds < YEAR:
        return f"{_plural(seconds // MONTH, 'month')} ago"
    return f"{_plural(seconds // YEAR, 'year')} ago"
