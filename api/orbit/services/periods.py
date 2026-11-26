"""Monthly periods anchored on a day of the month."""

from __future__ import annotations

import calendar
from datetime import datetime


def _add_months(anchor: datetime, months: int) -> datetime:
    index = anchor.year * 12 + anchor.month - 1 + months
    year, month = divmod(index, 12)
    month += 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def period_bounds(anchor: datetime, now: datetime) -> tuple[datetime, datetime]:
    """The monthly period around now: it starts on the anchor's day of the month."""
    months = (now.year - anchor.year) * 12 + now.month - anchor.month
    start = _add_months(anchor, months)
    if start > now:
        months -= 1
        start = _add_months(anchor, months)
    return start, _add_months(anchor, months + 1)
