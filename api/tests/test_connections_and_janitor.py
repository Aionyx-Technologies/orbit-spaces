from __future__ import annotations

import re
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit import models
from orbit.db import session_scope
from orbit.errors import NotFound
from orbit.models import User
from orbit.oauth.connections import connection_id, list_connections, revoke_connection
from orbit.runtime import Runtime
from orbit.security import hash_token
from orbit.services.janitor import run_cleanup
from tests.conftest import FakeClock, RecordingSender
from tests.oauth_helpers import connect, mcp_rpc


def user_id_of(runtime: Runtime, email: str) -> str:
    with session_scope(runtime.session_factory) as db:
        return db.scalars(select(User).where(User.email == email)).one().id


def count(db: Session, model: Any) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_each_connected_assistant_is_listed_once_newest_first(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    connect(client, runtime, sender, name="ChatGPT")
    connect(client, runtime, sender, name="Grok")
    alex = user_id_of(runtime, "alex@example.com")

    with session_scope(runtime.session_factory) as db:
        views = list_connections(db, runtime.env, alex)

    assert [view.client_name for view in views] == ["Grok", "ChatGPT"]
    assert [view.client_host for view in views] == ["chatgpt.test", "chatgpt.test"]
    assert all(re.fullmatch(r"[0-9a-f]{16}", view.id) for view in views)
    assert len({view.id for view in views}) == 2


def test_people_only_see_their_own_connections(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    connect(client, runtime, sender, name="ChatGPT", email="alex@example.com")
    client.cookies.clear()
    connect(client, runtime, sender, name="Claude", email="bob@example.com")
    alex = user_id_of(runtime, "alex@example.com")
    bob = user_id_of(runtime, "bob@example.com")

    with session_scope(runtime.session_factory) as db:
        alex_views = list_connections(db, runtime.env, alex)
        bob_views = list_connections(db, runtime.env, bob)

    assert [view.client_name for view in alex_views] == ["ChatGPT"]
    assert [view.client_name for view in bob_views] == ["Claude"]


def test_a_connection_with_two_token_sets_is_still_one_row(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)
    client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": tokens["client_id"],
            "refresh_token": tokens["refresh_token"],
        },
    )

    with session_scope(runtime.session_factory) as db:
        views = list_connections(db, runtime.env, user_id_of(runtime, "alex@example.com"))

    assert len(views) == 1


def test_revoking_a_connection_cuts_off_only_that_assistant(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    first = connect(client, runtime, sender, name="ChatGPT")
    second = connect(client, runtime, sender, name="Grok")
    alex = user_id_of(runtime, "alex@example.com")

    with session_scope(runtime.session_factory) as db:
        revoke_connection(db, runtime.env, alex, connection_id(first["client_id"]))
        remaining = list_connections(db, runtime.env, alex)

    assert [view.client_name for view in remaining] == ["Grok"]
    assert mcp_rpc(client, first["access_token"], "tools/list").status_code == 401
    assert mcp_rpc(client, second["access_token"], "tools/list").status_code == 200
    refresh = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": first["client_id"],
            "refresh_token": first["refresh_token"],
        },
    )
    assert refresh.status_code == 400


def revoke_unknown(runtime: Runtime, user_id: str, wanted: str) -> None:
    with session_scope(runtime.session_factory) as db:
        revoke_connection(db, runtime.env, user_id, wanted)


def test_revoking_something_that_is_not_yours_or_not_there_is_not_found(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    alexs = connect(client, runtime, sender, email="alex@example.com")
    client.cookies.clear()
    connect(client, runtime, sender, name="Claude", email="bob@example.com")
    bob = user_id_of(runtime, "bob@example.com")
    alex = user_id_of(runtime, "alex@example.com")
    alexs_id = connection_id(alexs["client_id"])

    with pytest.raises(NotFound):
        revoke_unknown(runtime, bob, alexs_id)
    with pytest.raises(NotFound):
        revoke_unknown(runtime, alex, "0123456789abcdef")

    revoke_unknown(runtime, alex, alexs_id)
    with pytest.raises(NotFound):
        revoke_unknown(runtime, alex, alexs_id)
    assert mcp_rpc(client, alexs["access_token"], "tools/list").status_code == 401


def test_connections_disappear_when_the_refresh_token_expires(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    connect(client, runtime, sender)
    clock.advance(days=31)

    with session_scope(runtime.session_factory) as db:
        views = list_connections(db, runtime.env, user_id_of(runtime, "alex@example.com"))

    assert views == []


def test_connection_ids_are_stable_and_do_not_reveal_the_client_id() -> None:
    client_id = "https://client.example/oauth/metadata.json"

    assert connection_id(client_id) == connection_id(client_id)
    assert client_id not in connection_id(client_id)
    assert connection_id(client_id) != connection_id(client_id + "x")


def seed_auth_rows(runtime: Runtime) -> None:
    now = runtime.env.now()
    with session_scope(runtime.session_factory) as db:
        db.add(User(id="u1", email="u1@example.com", display_name="U", created_at=now))
        db.flush()
        for client_id, kind in (
            ("dcr-idle", "dcr"),
            ("dcr-used", "dcr"),
            ("https://c.example/m", "cimd"),
        ):
            db.add(
                models.OAuthClient(
                    client_id=client_id,
                    client_name=client_id,
                    redirect_uris=["https://c.example/cb"],
                    registration_type=kind,
                    metadata_json={},
                    created_at=now,
                )
            )
        db.flush()
        db.add(
            models.MagicLink(
                token_hash=hash_token("link"),
                email="u1@example.com",
                purpose="sign_in",
                expires_at=now + timedelta(minutes=15),
                used_at=None,
            )
        )
        db.add(
            models.WebSession(
                token_hash=hash_token("session"),
                user_id="u1",
                expires_at=now + timedelta(days=30),
                created_at=now,
            )
        )
        db.add(
            models.OAuthCode(
                code_hash=hash_token("code"),
                client_id="dcr-used",
                user_id="u1",
                redirect_uri="https://c.example/cb",
                code_challenge="x",
                resource=None,
                scopes=["spaces"],
                expires_at=now + timedelta(minutes=10),
                used_at=None,
            )
        )
        db.add(
            models.OAuthToken(
                access_hash=hash_token("access"),
                refresh_hash=hash_token("refresh"),
                client_id="dcr-used",
                user_id="u1",
                scopes=["spaces"],
                resource=None,
                access_expires_at=now + timedelta(hours=1),
                refresh_expires_at=now + timedelta(days=30),
                revoked_at=None,
                created_at=now,
            )
        )
        db.commit()


def test_cleanup_keeps_live_rows_and_removes_stale_ones(
    runtime: Runtime, client: TestClient, clock: FakeClock
) -> None:
    seed_auth_rows(runtime)

    clock.advance(days=2)
    with session_scope(runtime.session_factory) as db:
        run_cleanup(db, runtime.env)
        assert count(db, models.MagicLink) == 0
        assert count(db, models.OAuthCode) == 0
        assert count(db, models.WebSession) == 1
        assert count(db, models.OAuthToken) == 1
        assert count(db, models.OAuthClient) == 2

    clock.advance(days=100)
    with session_scope(runtime.session_factory) as db:
        run_cleanup(db, runtime.env)
        assert count(db, models.WebSession) == 0
        assert count(db, models.OAuthToken) == 0
        remaining = [row.client_id for row in db.scalars(select(models.OAuthClient))]

    assert remaining == []


def test_cleanup_keeps_a_metadata_client_that_still_has_a_connection(
    runtime: Runtime, client: TestClient, clock: FakeClock
) -> None:
    seed_auth_rows(runtime)
    now = runtime.env.now()
    with session_scope(runtime.session_factory) as db:
        db.add(
            models.OAuthToken(
                access_hash=hash_token("metadata-access"),
                refresh_hash=hash_token("metadata-refresh"),
                client_id="https://c.example/m",
                user_id="u1",
                scopes=["spaces"],
                resource=None,
                access_expires_at=now + timedelta(hours=1),
                refresh_expires_at=now + timedelta(days=30),
                revoked_at=None,
                created_at=now,
            )
        )
        db.commit()

    clock.advance(days=2)
    with session_scope(runtime.session_factory) as db:
        run_cleanup(db, runtime.env)
        remaining = sorted(row.client_id for row in db.scalars(select(models.OAuthClient)))

    assert remaining == ["dcr-idle", "dcr-used", "https://c.example/m"]


def test_cleanup_removes_revoked_tokens_after_a_week(
    runtime: Runtime, client: TestClient, clock: FakeClock
) -> None:
    seed_auth_rows(runtime)
    with session_scope(runtime.session_factory) as db:
        row = db.scalars(select(models.OAuthToken)).one()
        row.revoked_at = runtime.env.now()
        db.commit()

    clock.advance(days=3)
    with session_scope(runtime.session_factory) as db:
        run_cleanup(db, runtime.env)
        assert count(db, models.OAuthToken) == 1

    clock.advance(days=5)
    with session_scope(runtime.session_factory) as db:
        run_cleanup(db, runtime.env)
        assert count(db, models.OAuthToken) == 0


def test_cleanup_forgets_stripe_events_after_ninety_days(
    runtime: Runtime, client: TestClient, clock: FakeClock
) -> None:
    now = runtime.env.now()
    with session_scope(runtime.session_factory) as db:
        db.add_all(
            [
                models.StripeEvent(
                    id="evt_old", type="charge.refunded", received_at=now - timedelta(days=91)
                ),
                models.StripeEvent(
                    id="evt_recent", type="charge.refunded", received_at=now - timedelta(days=89)
                ),
            ]
        )
        db.commit()

    with session_scope(runtime.session_factory) as db:
        run_cleanup(db, runtime.env)
        kept = list(db.scalars(select(models.StripeEvent.id)))

    assert kept == ["evt_recent"]
