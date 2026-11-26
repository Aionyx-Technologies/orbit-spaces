from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from orbit.limits import CONTEXT_ITEM_COUNT
from orbit.services import readstate
from orbit.services.items import has_shared_items, latest_plan, recent_notes
from orbit.services.memory import current_facts
from orbit.services.spaces import get_space_view
from orbit.services.views import SpaceContext, SpaceDetail
from orbit.space_templates import unset_facts


def get_space_context(db: Session, user_id: str, space_id: str, now: datetime) -> SpaceContext:
    space = get_space_view(db, user_id, space_id)
    since = readstate.last_read_at(db, user_id, space_id)
    new = readstate.new_activity(db, user_id, space_id, since)
    facts = current_facts(db, space_id)
    context = SpaceContext(
        space=space,
        facts=facts,
        unset_facts=unset_facts(space.template, (fact.key for fact in facts)),
        recent_items=recent_notes(db, space_id, CONTEXT_ITEM_COUNT),
        latest_plan=latest_plan(db, space_id),
        new=new,
        has_own_items=has_shared_items(db, user_id, space_id),
    )
    readstate.mark_read(db, user_id, space_id, now)
    return context


def get_space_detail(db: Session, user_id: str, space_id: str) -> SpaceDetail:
    space = get_space_view(db, user_id, space_id)
    facts = current_facts(db, space_id)
    return SpaceDetail(
        space=space,
        facts=facts,
        unset_facts=unset_facts(space.template, (fact.key for fact in facts)),
        latest_plan=latest_plan(db, space_id),
    )
