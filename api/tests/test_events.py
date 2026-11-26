from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
import uvicorn
from fastapi import FastAPI

from orbit.auth.sessions import create_session
from orbit.db import session_scope
from orbit.events import (
    ITEM_ADDED,
    ITEM_RETRACTED,
    MEMBER_JOINED,
    MEMORY_SET,
    QUEUE_SIZE,
    RESYNC,
    Broadcaster,
    SpaceEvent,
    format_sse,
)
from orbit.models import User, new_id
from orbit.routes.events import event_stream
from orbit.runtime import Runtime
from orbit.services import invites as invites_service
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import spaces as spaces_service
from orbit.services.context import Actor
from tests.conftest import BASE_URL

pytestmark = pytest.mark.anyio


async def next_event(queue: asyncio.Queue[SpaceEvent]) -> SpaceEvent:
    return await asyncio.wait_for(queue.get(), timeout=2)


def test_events_are_formatted_as_server_sent_events() -> None:
    frame = format_sse(SpaceEvent(ITEM_ADDED, "space-1", {"item_id": "item-9"}))

    assert frame == 'event: item_added\ndata: {"space_id":"space-1","item_id":"item-9"}\n\n'
    assert json.loads(frame.split("data: ")[1]) == {"space_id": "space-1", "item_id": "item-9"}


async def test_subscribers_hear_only_their_own_space() -> None:
    broadcaster = Broadcaster()
    mine = broadcaster.subscribe("mine")
    other = broadcaster.subscribe("other")

    broadcaster.publish(SpaceEvent(ITEM_ADDED, "mine", {"item_id": "1"}))

    assert (await next_event(mine.queue)).data == {"item_id": "1"}
    await asyncio.sleep(0.05)
    assert other.queue.empty()


async def test_several_subscribers_to_one_space_all_hear_it() -> None:
    broadcaster = Broadcaster()
    first = broadcaster.subscribe("space")
    second = broadcaster.subscribe("space")

    broadcaster.publish(SpaceEvent(MEMORY_SET, "space"))

    assert (await next_event(first.queue)).type == MEMORY_SET
    assert (await next_event(second.queue)).type == MEMORY_SET
    assert broadcaster.subscriber_count("space") == 2


async def test_an_unsubscribed_listener_hears_nothing_more() -> None:
    broadcaster = Broadcaster()
    subscription = broadcaster.subscribe("space")
    broadcaster.unsubscribe(subscription)
    broadcaster.unsubscribe(subscription)

    broadcaster.publish(SpaceEvent(ITEM_ADDED, "space"))

    await asyncio.sleep(0.05)
    assert subscription.queue.empty()
    assert broadcaster.subscriber_count("space") == 0


async def test_publishing_from_a_worker_thread_reaches_the_event_loop() -> None:
    broadcaster = Broadcaster()
    subscription = broadcaster.subscribe("space")
    worker = threading.Thread(
        target=broadcaster.publish, args=(SpaceEvent(ITEM_ADDED, "space", {"item_id": "t"}),)
    )

    worker.start()
    event = await next_event(subscription.queue)
    worker.join()

    assert event.data == {"item_id": "t"}


async def test_a_listener_that_falls_behind_is_told_to_resync() -> None:
    broadcaster = Broadcaster()
    subscription = broadcaster.subscribe("space")
    for index in range(QUEUE_SIZE + 5):
        broadcaster.publish(SpaceEvent(ITEM_ADDED, "space", {"item_id": str(index)}))
    await asyncio.sleep(0.1)

    stream = event_stream(subscription, keepalive_seconds=5)
    greeting = await anext(stream)
    first = await anext(stream)

    assert greeting == ": connected\n\n"
    assert subscription.overflowed is False
    assert first == format_sse(SpaceEvent(RESYNC, "space"))
    assert subscription.queue.empty()
    await stream.aclose()


async def test_the_stream_greets_delivers_events_and_keeps_alive() -> None:
    broadcaster = Broadcaster()
    subscription = broadcaster.subscribe("space")
    stream = event_stream(subscription, keepalive_seconds=0.05)

    greeting = await anext(stream)
    quiet = await anext(stream)
    broadcaster.publish(SpaceEvent(ITEM_RETRACTED, "space", {"item_id": "x"}))
    delivered = await anext(stream)
    await stream.aclose()

    assert greeting == ": connected\n\n"
    assert quiet == ": keepalive\n\n"
    assert delivered == format_sse(SpaceEvent(ITEM_RETRACTED, "space", {"item_id": "x"}))


@pytest.mark.usefixtures("engine")
async def test_services_announce_what_changed_without_revealing_content(
    runtime: Runtime,
) -> None:
    env = runtime.env
    with session_scope(runtime.session_factory) as db:
        alex = User(id=new_id(), email="a@example.com", display_name="Alex", created_at=env.now())
        blake = User(id=new_id(), email="b@example.com", display_name="Blake", created_at=env.now())
        db.add_all([alex, blake])
        db.flush()
        space = spaces_service.create_space(db, env, Actor.web(alex.id), "Trip")
        elsewhere = spaces_service.create_space(db, env, Actor.web(alex.id), "Elsewhere")
        db.commit()
        alex_id, blake_id = alex.id, blake.id

    here = env.events.subscribe(space.id)
    there = env.events.subscribe(elsewhere.id)

    def act() -> tuple[str, str]:
        with session_scope(runtime.session_factory) as db:
            item = items_service.share_item(
                db, env, Actor.web(alex_id), space.id, "Secret title", "Secret body"
            )
            memory_service.set_fact(db, env, Actor.web(alex_id), space.id, "Secret key", "v1")
            memory_service.set_fact(db, env, Actor.web(alex_id), space.id, "Secret key", "v1")
            memory_service.set_fact(db, env, Actor.web(alex_id), space.id, "Secret key", "v2")
            items_service.retract_item(db, env, Actor.web(alex_id), item.id)
            invite = invites_service.create_invite(db, env, Actor.web(alex_id), space.id, None)
            token = invite.url.rsplit("/", 1)[-1]
        with session_scope(runtime.session_factory) as db:
            invites_service.accept_invite(db, env, blake_id, token)
        return item.id, blake_id

    item_id, joined_user = await asyncio.to_thread(act)

    events = [await next_event(here.queue) for _ in range(5)]
    assert [event.type for event in events] == [
        ITEM_ADDED,
        MEMORY_SET,
        MEMORY_SET,
        ITEM_RETRACTED,
        MEMBER_JOINED,
    ]
    assert events[0].data == {"item_id": item_id}
    assert events[4].data == {"user_id": joined_user}
    serialised = json.dumps([format_sse(event) for event in events])
    for secret in ("Secret title", "Secret body", "Secret key", "v1", "v2"):
        assert secret not in serialised
    await asyncio.sleep(0.05)
    assert here.queue.empty()
    assert there.queue.empty()


@asynccontextmanager
async def serving(app: FastAPI) -> AsyncIterator[str]:
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    for _ in range(500):
        if server.started:
            break
        await asyncio.sleep(0.01)
    assert server.started, "the test server did not start"
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await task


def make_member_and_session(
    runtime: Runtime, email: str, space_name: str | None
) -> tuple[str, str]:
    env = runtime.env
    with session_scope(runtime.session_factory) as db:
        user = User(id=new_id(), email=email, display_name="Person", created_at=env.now())
        db.add(user)
        db.flush()
        space_id = ""
        if space_name:
            space_id = spaces_service.create_space(db, env, Actor.web(user.id), space_name).id
        token = create_session(db, env, user.id)
        return token, space_id


async def test_the_stream_works_over_real_http(app: FastAPI, runtime: Runtime) -> None:
    async with serving(app) as base:
        token, space_id = await asyncio.to_thread(
            make_member_and_session, runtime, "a@example.com", "Trip"
        )
        outsider, _ = await asyncio.to_thread(
            make_member_and_session, runtime, "b@example.com", None
        )
        async with httpx.AsyncClient(base_url=base, timeout=5) as http:
            anonymous = await http.get(f"/api/spaces/{space_id}/events")
            stranger = await http.get(
                f"/api/spaces/{space_id}/events", headers={"Cookie": f"orbit_session={outsider}"}
            )
            async with http.stream(
                "GET",
                f"/api/spaces/{space_id}/events",
                headers={"Cookie": f"orbit_session={token}"},
            ) as response:
                lines = response.aiter_lines()
                greeting = await anext(lines)
                shared = await http.post(
                    f"/api/spaces/{space_id}/items",
                    json={"title": "Live", "content": "Arrives immediately"},
                    headers={"Cookie": f"orbit_session={token}", "Origin": BASE_URL},
                )
                received: list[str] = []
                while len(received) < 2:
                    line = await asyncio.wait_for(anext(lines), 3)
                    if line:
                        received.append(line)

    assert anonymous.status_code == 401
    assert stranger.status_code == 403
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache, no-transform"
    assert response.headers["x-accel-buffering"] == "no"
    assert greeting == ": connected"
    assert shared.status_code == 201
    assert received[0] == "event: item_added"
    payload = json.loads(received[1].removeprefix("data: "))
    assert payload == {"space_id": space_id, "item_id": shared.json()["id"]}
