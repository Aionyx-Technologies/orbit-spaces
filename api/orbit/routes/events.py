from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from orbit.auth.deps import get_runtime, optional_user
from orbit.db import session_scope
from orbit.errors import Unauthenticated
from orbit.events import RESYNC, SpaceEvent, Subscription, format_sse
from orbit.runtime import Runtime
from orbit.services.spaces import require_member

router = APIRouter(tags=["events"])

KEEPALIVE_SECONDS = 15.0
STREAM_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


def _check_member(runtime: Runtime, user_id: str, space_id: str) -> None:
    with session_scope(runtime.read_session_factory) as db:
        require_member(db, user_id, space_id)


async def event_stream(
    subscription: Subscription, keepalive_seconds: float = KEEPALIVE_SECONDS
) -> AsyncIterator[str]:
    yield ": connected\n\n"
    while True:
        if subscription.overflowed:
            subscription.overflowed = False
            while not subscription.queue.empty():
                subscription.queue.get_nowait()
            yield format_sse(SpaceEvent(RESYNC, subscription.space_id))
        try:
            event = await asyncio.wait_for(subscription.queue.get(), timeout=keepalive_seconds)
        except TimeoutError:
            yield ": keepalive\n\n"
            continue
        yield format_sse(event)


@router.get("/spaces/{space_id}/events")
async def space_events(space_id: str, request: Request) -> StreamingResponse:
    runtime = get_runtime(request)
    user = await run_in_threadpool(optional_user, request)
    if user is None:
        raise Unauthenticated("Sign in to continue.")
    await run_in_threadpool(_check_member, runtime, user.id, space_id)
    subscription = runtime.env.events.subscribe(space_id)

    async def stream() -> AsyncIterator[str]:
        try:
            async for chunk in event_stream(subscription):
                yield chunk
        finally:
            runtime.env.events.unsubscribe(subscription)

    return StreamingResponse(stream(), media_type="text/event-stream", headers=STREAM_HEADERS)
