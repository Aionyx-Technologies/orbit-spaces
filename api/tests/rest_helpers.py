from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from orbit.db import session_scope
from orbit.models import SpaceMember, User
from orbit.runtime import Runtime
from tests.auth_helpers import open_sign_in_link
from tests.conftest import RecordingSender

HOST = "orbit.test"


class People:
    def __init__(self, client: TestClient, runtime: Runtime, sender: RecordingSender) -> None:
        self.client = client
        self.runtime = runtime
        self.sender = sender
        self.sessions: dict[str, str] = {}

    def sign_in(self, email: str, next_path: str = "/spaces") -> str:
        self.client.cookies.clear()
        asked = self.client.post("/auth/sign-in", data={"email": email, "next": next_path})
        assert asked.status_code == 200, asked.text
        self.runtime.env.mailer.drain()
        verified = open_sign_in_link(self.client, self.sender.last_link(email))
        assert verified.status_code == 303, verified.text
        self.sessions[email] = self.client.cookies["orbit_session"]
        return self.sessions[email]

    def as_(self, email: str) -> TestClient:
        if email not in self.sessions:
            self.sign_in(email)
        self.client.cookies.clear()
        self.client.cookies.set("orbit_session", self.sessions[email], domain=HOST, path="/")
        return self.client

    def anonymous(self) -> TestClient:
        self.client.cookies.clear()
        return self.client


def create_space(client: TestClient, name: str = "Goa trip") -> dict[str, Any]:
    response = client.post("/api/spaces", json={"name": name})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def share(client: TestClient, space_id: str, title: str, content: str = "Body") -> dict[str, Any]:
    response = client.post(
        f"/api/spaces/{space_id}/items", json={"title": title, "content": content}
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def join(people: People, owner_email: str, guest_email: str, space_id: str) -> None:
    invite = people.as_(owner_email).post(f"/api/spaces/{space_id}/invites", json={})
    assert invite.status_code == 201, invite.text
    token = invite.json()["url"].rsplit("/", 1)[-1]
    accepted = people.as_(guest_email).post(f"/api/invites/{token}/accept")
    assert accepted.status_code == 200, accepted.text


def fill_space(runtime: Runtime, space_id: str, people_count: int) -> None:
    now = runtime.env.now()
    with session_scope(runtime.session_factory) as db:
        for index in range(people_count):
            user = User(
                id=f"filler-{index}",
                email=f"filler{index}@example.com",
                display_name=f"Filler {index}",
                created_at=now,
            )
            db.add(user)
            db.flush()
            db.add(
                SpaceMember(space_id=space_id, user_id=user.id, joined_at=now, notify_email=True)
            )
        db.commit()
