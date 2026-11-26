from __future__ import annotations

import asyncio
import json
import threading
from collections import defaultdict
from dataclasses import dataclass, field

QUEUE_SIZE = 100

ITEM_ADDED = "item_added"
ITEM_RETRACTED = "item_retracted"
MEMORY_SET = "memory_set"
PLAN_ADDED = "plan_added"
MEMBER_JOINED = "member_joined"
TEMPLATE_CHANGED = "template_changed"
PROFILE_CHANGED = "profile_changed"
INVITES_CHANGED = "invites_changed"
RESYNC = "resync"


@dataclass(frozen=True)
class SpaceEvent:
    type: str
    space_id: str
    data: dict[str, str] = field(default_factory=dict)


def format_sse(event: SpaceEvent) -> str:
    payload = json.dumps({"space_id": event.space_id, **event.data}, separators=(",", ":"))
    return f"event: {event.type}\ndata: {payload}\n\n"


class Subscription:
    def __init__(self, space_id: str, loop: asyncio.AbstractEventLoop) -> None:
        self.space_id = space_id
        self.loop = loop
        self.queue: asyncio.Queue[SpaceEvent] = asyncio.Queue(maxsize=QUEUE_SIZE)
        self.overflowed = False

    def offer(self, event: SpaceEvent) -> None:
        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            self.overflowed = True


class Broadcaster:
    def __init__(self) -> None:
        self._subscriptions: dict[str, set[Subscription]] = defaultdict(set)
        self._lock = threading.Lock()

    def subscribe(self, space_id: str) -> Subscription:
        subscription = Subscription(space_id, asyncio.get_running_loop())
        with self._lock:
            self._subscriptions[space_id].add(subscription)
        return subscription

    def unsubscribe(self, subscription: Subscription) -> None:
        with self._lock:
            members = self._subscriptions.get(subscription.space_id)
            if members is None:
                return
            members.discard(subscription)
            if not members:
                del self._subscriptions[subscription.space_id]

    def subscriber_count(self, space_id: str) -> int:
        with self._lock:
            return len(self._subscriptions.get(space_id, ()))

    def publish(self, event: SpaceEvent) -> None:
        with self._lock:
            targets = list(self._subscriptions.get(event.space_id, ()))
        for subscription in targets:
            try:
                subscription.loop.call_soon_threadsafe(subscription.offer, event)
            except RuntimeError:
                self.unsubscribe(subscription)
