from __future__ import annotations

from datetime import timedelta

from orbit.ratelimit import InFlight, RateLimiter
from tests.conftest import FakeClock

LIMIT = (3, timedelta(minutes=10))


def test_hits_up_to_the_limit_are_allowed_then_blocked() -> None:
    limiter = RateLimiter(FakeClock())

    results = [limiter.allow("key", LIMIT) for _ in range(5)]

    assert results == [True, True, True, False, False]


def test_blocked_hits_do_not_extend_the_block() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    for _ in range(3):
        limiter.allow("key", LIMIT)
    for _ in range(50):
        assert limiter.allow("key", LIMIT) is False

    clock.advance(minutes=10)

    assert limiter.allow("key", LIMIT) is True


def test_keys_are_independent() -> None:
    limiter = RateLimiter(FakeClock())
    for _ in range(3):
        limiter.allow("a", LIMIT)

    assert limiter.allow("a", LIMIT) is False
    assert limiter.allow("b", LIMIT) is True


def test_old_hits_slide_out_of_the_window() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    limiter.allow("key", LIMIT)
    clock.advance(minutes=6)
    limiter.allow("key", LIMIT)
    limiter.allow("key", LIMIT)
    assert limiter.allow("key", LIMIT) is False

    clock.advance(minutes=5)

    assert limiter.allow("key", LIMIT) is True


def test_pruning_forgets_idle_keys_but_keeps_recent_ones() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    limiter.allow("idle", LIMIT)
    clock.advance(hours=3)
    limiter.allow("recent", LIMIT)

    limiter.prune()

    assert limiter.allow("idle", (1, timedelta(hours=5))) is True
    assert limiter.allow("recent", (1, timedelta(hours=5))) is False


def test_in_flight_work_is_limited_per_key_and_overall() -> None:
    guard = InFlight(2)

    assert guard.try_acquire("a") is True
    assert guard.try_acquire("a") is False
    assert guard.try_acquire("b") is True
    assert guard.try_acquire("c") is False
    assert guard.holds("a") is True
    assert guard.holds("c") is False
    guard.release("a")
    assert guard.try_acquire("c") is True


def test_without_an_overall_limit_only_the_same_key_is_refused() -> None:
    guard = InFlight()

    results = [guard.try_acquire(str(index)) for index in range(50)]

    assert all(results)
    assert guard.try_acquire("7") is False


def test_used_counts_hits_in_the_window_without_recording_one() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    assert limiter.used("key", LIMIT) == 0
    limiter.allow("key", LIMIT)
    limiter.allow("key", LIMIT)

    assert limiter.used("key", LIMIT) == 2
    assert limiter.used("key", LIMIT) == 2
    clock.advance(minutes=11)
    assert limiter.used("key", LIMIT) == 0
