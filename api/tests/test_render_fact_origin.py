from __future__ import annotations

from datetime import UTC, datetime

from orbit.render import Shared, _fact_block, _new_section, render_fact_history
from orbit.services.context import VIA_ORBIT_SUGGESTION
from orbit.services.views import FactEvent, FactView, NewActivity

NOW = datetime(2026, 1, 2, tzinfo=UTC)


def make_fact(via: str) -> FactView:
    return FactView("Budget", "$3,000", "u1", "Alex", via, NOW)


def test_a_suggested_fact_never_reads_as_an_assistant() -> None:
    block = _fact_block(Shared(), make_fact(VIA_ORBIT_SUGGESTION), NOW)

    assert "Fact set by Alex, suggested by Orbit on" in block
    assert "orbit-suggestion" not in block


def test_an_assistant_fact_still_names_the_assistant() -> None:
    assert "Fact set by Alex via Grok on" in _fact_block(Shared(), make_fact("Grok"), NOW)


def test_new_activity_describes_a_suggested_fact_without_via() -> None:
    new = NewActivity(first_look=False, facts=[make_fact(VIA_ORBIT_SUGGESTION)], items=[], plans=[])

    text = _new_section(Shared(), new, NOW)

    assert "set by Alex, suggested by Orbit," in text
    assert "orbit-suggestion" not in text


def make_event(via: str) -> FactEvent:
    return FactEvent("add", "Budget", None, "$3,000", None, "u1", "Alex", via, NOW)


def test_fact_history_describes_a_suggested_fact_without_via() -> None:
    text = render_fact_history([make_event(VIA_ORBIT_SUGGESTION)], None, NOW)

    assert "Fact added by Alex, suggested by Orbit on" in text
    assert "orbit-suggestion" not in text


def test_fact_history_still_names_the_assistant() -> None:
    assert "by Alex via Grok on" in render_fact_history([make_event("Grok")], None, NOW)
