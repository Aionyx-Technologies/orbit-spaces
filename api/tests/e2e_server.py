from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from fastapi import APIRouter, FastAPI, Query, Request

from orbit.config import Settings
from orbit.email import EmailMessage
from orbit.llm import FactInput, ItemInput
from orbit.main import Overrides, create_app
from orbit.runtime import Runtime
from orbit.space_templates import SpaceTemplate
from tests.template_helpers import FakeDrafter, suggested_reply


class MailDrop:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.messages.append(message)


class ScriptedCombiner:
    def __call__(
        self,
        memory: Sequence[FactInput],
        items: Sequence[ItemInput],
        instruction: str | None,
        omitted_items: int = 0,
        template: SpaceTemplate | None = None,
    ) -> str:
        facts = [f"- {fact.key}: {fact.value}" for fact in memory]
        shared = [f"- {item.title} (from {item.shared_by or 'someone'})" for item in items]
        return "\n".join(
            ["Here is the combined plan.", *facts, *shared, "", "To settle", "- Nothing yet"]
        )


GOA_REPLY = suggested_reply(
    name="Goa trip",
    description="Six friends planning a December week",
)


def build_e2e_app() -> FastAPI:
    settings = Settings()
    drop = MailDrop()
    app = create_app(
        settings,
        overrides=Overrides(
            sender=drop,
            llm=ScriptedCombiner(),
            drafter=FakeDrafter(suggest_replies=[GOA_REPLY]),
        ),
    )
    router = APIRouter()

    @router.get("/__test__/emails")
    def emails(request: Request, to: str = Query("")) -> dict[str, Any]:
        runtime: Runtime = request.app.state.runtime
        runtime.env.mailer.drain()
        wanted = to.strip().lower()
        return {
            "messages": [
                {"to": m.to, "subject": m.subject, "text": m.text, "html": m.html}
                for m in drop.messages
                if not wanted or m.to == wanted
            ]
        }

    app.router.routes[0:0] = router.routes
    return app
