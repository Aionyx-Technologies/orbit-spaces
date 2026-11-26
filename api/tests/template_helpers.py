from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from orbit.llm import CombineFailed
from orbit.space_templates import SpaceTemplate

DRAFTED: dict[str, Any] = {
    "name": "Garden club",
    "description": "Run the allotment together",
    "facts": [
        {"key": "Plot", "hint": "Which plot is ours"},
        {"key": "Watering rota", "hint": "Who waters on which day"},
    ],
    "plan_sections": ["This month", "Shopping list"],
    "combine_hint": "Prefer tasks that someone has volunteered for.",
    "tips": ["Share the rota", "List what to buy"],
}


def drafted_reply(**changes: Any) -> str:
    return json.dumps({**DRAFTED, **changes})


SUGGESTED: dict[str, Any] = {
    "base": "trip",
    "name": "Goa trip",
    "description": "Plan the Goa trip together",
    "facts": [
        {"key": "Dates", "hint": "When you travel"},
        {"key": "Destination", "hint": "Where you go"},
        {"key": "Headcount", "hint": "How many people"},
        {"key": "Budget", "hint": "What each person can spend"},
    ],
    "plan_sections": ["Itinerary", "Costs"],
    "combine_hint": "Prefer plans that fit the budget.",
    "tips": ["Share your dates"],
    "values": {"Dates": "Dec 20\u201327", "Headcount": "6", "Budget": "\u20b915,000 each"},
}


def suggested_reply(**changes: Any) -> str:
    return json.dumps({**SUGGESTED, **changes})


@dataclass
class FakeDrafter:
    replies: list[str] = field(default_factory=lambda: [drafted_reply()])
    error: CombineFailed | None = None
    purposes: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    suggest_replies: list[str] = field(default_factory=lambda: [suggested_reply()])

    def __call__(self, purpose: str) -> str:
        self.purposes.append(purpose)
        if self.error is not None:
            raise self.error
        position = min(len(self.purposes), len(self.replies)) - 1
        return self.replies[position]

    def suggest(self, purpose: str, templates: Sequence[SpaceTemplate]) -> str:
        self.suggestions.append(purpose)
        if self.error is not None:
            raise self.error
        position = min(len(self.suggestions), len(self.suggest_replies)) - 1
        return self.suggest_replies[position]
