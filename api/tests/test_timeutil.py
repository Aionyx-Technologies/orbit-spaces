from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from orbit.timeutil import relative_age

NOW = datetime(2026, 11, 21, 12, 0, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("delta", "expected"),
    [
        (timedelta(seconds=0), "just now"),
        (timedelta(seconds=59), "just now"),
        (timedelta(seconds=-30), "just now"),
        (timedelta(minutes=1), "1 minute ago"),
        (timedelta(minutes=59, seconds=59), "59 minutes ago"),
        (timedelta(hours=1), "1 hour ago"),
        (timedelta(hours=2, minutes=40), "2 hours ago"),
        (timedelta(hours=23, minutes=59), "23 hours ago"),
        (timedelta(days=1), "1 day ago"),
        (timedelta(days=13), "13 days ago"),
        (timedelta(days=14), "2 weeks ago"),
        (timedelta(days=45), "6 weeks ago"),
        (timedelta(days=60), "2 months ago"),
        (timedelta(days=364), "12 months ago"),
        (timedelta(days=365), "1 year ago"),
        (timedelta(days=800), "2 years ago"),
    ],
)
def test_ages_read_the_way_a_person_would_say_them(delta: timedelta, expected: str) -> None:
    assert relative_age(NOW - delta, NOW) == expected
