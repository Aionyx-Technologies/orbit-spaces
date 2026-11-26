from __future__ import annotations

import threading
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta

from orbit.timeutil import utcnow

PRUNE_AFTER = timedelta(hours=2)


class RateLimiter:
    def __init__(self, clock: Callable[[], datetime] = utcnow) -> None:
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit_and_window: tuple[int, timedelta]) -> bool:
        limit, window = limit_and_window
        now = self._clock().timestamp()
        cutoff = now - window.total_seconds()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True

    def used(self, key: str, limit_and_window: tuple[int, timedelta]) -> int:
        _limit, window = limit_and_window
        cutoff = self._clock().timestamp() - window.total_seconds()
        with self._lock:
            hits = self._hits.get(key)
            if hits is None:
                return 0
            return sum(1 for hit in hits if hit > cutoff)

    def prune(self) -> None:
        cutoff = self._clock().timestamp() - PRUNE_AFTER.total_seconds()
        with self._lock:
            stale = [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
            for key in stale:
                del self._hits[key]


class InFlight:
    def __init__(self, limit: int | None = None) -> None:
        self._active: set[str] = set()
        self._limit = limit
        self._lock = threading.Lock()

    def try_acquire(self, key: str) -> bool:
        with self._lock:
            if key in self._active:
                return False
            if self._limit is not None and len(self._active) >= self._limit:
                return False
            self._active.add(key)
            return True

    def holds(self, key: str) -> bool:
        with self._lock:
            return key in self._active

    def release(self, key: str) -> None:
        with self._lock:
            self._active.discard(key)
