from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from orbit.limits import INVITE_TTL
from orbit.models import Invite, Item, Memory, Space, SpaceMember, User, new_id
from orbit.security import hash_token, new_token
from orbit.services.context import (
    AUTHOR_ASSISTANT,
    AUTHOR_ORBIT,
    AUTHOR_PERSON,
    KIND_NOTE,
    KIND_PLAN,
    VIA_ORBIT,
    VIA_WEB,
    Env,
)
from orbit.services.memory import FACT_ADD
from orbit.space_templates import GENERAL_ID, builtin_template, template_to_dict


@dataclass(frozen=True)
class DemoPerson:
    key: str
    email: str
    name: str


ALEX = DemoPerson("alex", "alex@example.com", "Alex")
BLAKE = DemoPerson("blake", "blake@example.com", "Blake")
DEMO_PEOPLE = (ALEX, BLAKE)
SAMPLE_SPACE = "Goa trip"
EMPTY_SPACE = "Weekend in Lisbon"
CABIN_SPACE = "Cabin weekend"
CLUB_SPACE = "Book club"
SAMPLE_PLAN = (
    "Sample plan for the demo. Fly out on the **7:10 flight on Dec 20** and check in at the "
    "hotel by late morning. Seaside Inn is cheaper, Palm View includes breakfast.\n\n"
    "- Dates: Dec 20 to 23\n- Budget: $3,000 for the two of us\n\n"
    "To settle\n- Which hotel: Seaside Inn or Palm View"
)
CABIN_SHORTLIST = (
    "Pinecrest Lodge: sleeps 8, hot tub, $240 a night.\n"
    "Lakeview Cabin: sleeps 6, wood stove, $190 a night."
)
CABIN_GROCERIES = (
    "Coffee and oat milk\nPancake mix and maple syrup\nFirewood and fire starters\n"
    "Snacks for the drive"
)
CLUB_PICK = (
    "Front-runner is a 320-page novel that is easy to finish in three weeks.\n"
    "Vote in the group chat by Friday."
)


def demo_person(key: str) -> DemoPerson | None:
    return next((person for person in DEMO_PEOPLE if person.key == key), None)


def _ensure_user(db: Session, person: DemoPerson, created_at: datetime) -> User:
    user = db.scalar(select(User).where(User.email == person.email))
    if user is None:
        user = User(
            id=new_id(), email=person.email, display_name=person.name, created_at=created_at
        )
        db.add(user)
        db.flush()
    return user


def _note(
    space_id: str, author: User, via: str, title: str, content: str, created_at: datetime
) -> Item:
    return Item(
        id=new_id(),
        space_id=space_id,
        kind=KIND_NOTE,
        title=title,
        content=content,
        author_kind=AUTHOR_PERSON if via == VIA_WEB else AUTHOR_ASSISTANT,
        shared_by=author.id,
        via=via,
        source_item_ids=None,
        created_at=created_at,
    )


def _fact(
    space_id: str, author: User, via: str, key: str, value: str, created_at: datetime
) -> Memory:
    return Memory(
        id=new_id(),
        space_id=space_id,
        fact_id=new_id(),
        action=FACT_ADD,
        key=key,
        value=value,
        set_by=author.id,
        via=via,
        created_at=created_at,
        superseded_at=None,
    )


def _find_space(db: Session, owner: User, name: str) -> Space | None:
    return db.scalar(
        select(Space)
        .where(Space.created_by == owner.id, Space.name == name, Space.deleted_at.is_(None))
        .order_by(Space.created_at, Space.id)
        .limit(1)
    )


def _ensure_space(db: Session, owner: User, name: str, add: Callable[[], Space]) -> Space:
    existing = _find_space(db, owner, name)
    return existing if existing is not None else add()


def _add_space(
    db: Session,
    owner: User,
    name: str,
    created_at: datetime,
    members: Sequence[User],
    template_id: str = GENERAL_ID,
) -> Space:
    template = builtin_template(template_id)
    space = Space(
        id=new_id(),
        name=name,
        created_by=owner.id,
        created_at=created_at,
        template_id=template.id,
        template=template_to_dict(template),
    )
    db.add(space)
    db.flush()
    for member in members:
        db.add(SpaceMember(space_id=space.id, user_id=member.id, joined_at=created_at))
    return space


def _add_goa_notes(db: Session, space: Space, alex: User, blake: User, now: datetime) -> list[Item]:
    notes = [
        _note(
            space.id,
            alex,
            "ChatGPT",
            "Morning flight",
            "Leaves Dec 20 at 7:10, lands at 9:25.\nEconomy fares are about $210 each.",
            now - timedelta(hours=26),
        ),
        _note(
            space.id,
            alex,
            VIA_WEB,
            "Packing list",
            "Passports and printouts of the e-visa\nSunscreen, SPF 50\nLight rain jacket\n"
            "Power adapter (type D)",
            now - timedelta(hours=20),
        ),
        _note(
            space.id,
            blake,
            "Grok",
            "Hotel shortlist",
            "Seaside Inn: $120 a night, 5 minutes from the beach.\n"
            "Palm View: $150 a night, pool and breakfast included.",
            now - timedelta(hours=3),
        ),
    ]
    db.add_all(notes)
    return notes


def _add_goa_facts(db: Session, space: Space, alex: User, blake: User, now: datetime) -> None:
    db.add_all(
        [
            _fact(space.id, alex, "ChatGPT", "Dates", "Dec 20 to 23", now - timedelta(hours=26)),
            _fact(
                space.id,
                blake,
                "Grok",
                "Budget",
                "$3,000 for the two of us",
                now - timedelta(hours=3),
            ),
            _fact(
                space.id,
                blake,
                "Grok",
                "Hotel",
                "Seaside Inn (not confirmed)",
                now - timedelta(hours=3),
            ),
        ]
    )


def _add_goa_trip(db: Session, alex: User, blake: User, now: datetime) -> Space:
    space = _add_space(db, alex, SAMPLE_SPACE, now - timedelta(hours=30), (alex, blake), "trip")
    notes = _add_goa_notes(db, space, alex, blake, now)
    _add_goa_facts(db, space, alex, blake, now)
    db.add(
        Item(
            id=new_id(),
            space_id=space.id,
            kind=KIND_PLAN,
            title="Combined plan",
            content=SAMPLE_PLAN,
            author_kind=AUTHOR_ORBIT,
            shared_by=None,
            via=VIA_ORBIT,
            source_item_ids=[note.id for note in notes],
            created_at=now - timedelta(minutes=20),
        )
    )
    return space


def _add_lisbon(db: Session, alex: User, now: datetime) -> Space:
    return _add_space(db, alex, EMPTY_SPACE, now - timedelta(hours=1), (alex,), "trip")


def _add_cabin_weekend(db: Session, alex: User, blake: User, now: datetime) -> Space:
    space = _add_space(db, blake, CABIN_SPACE, now - timedelta(hours=6), (blake, alex), "trip")
    db.add_all(
        [
            _note(
                space.id,
                blake,
                "Claude",
                "Cabin shortlist",
                CABIN_SHORTLIST,
                now - timedelta(hours=5),
            ),
            _note(
                space.id, alex, VIA_WEB, "Grocery run", CABIN_GROCERIES, now - timedelta(hours=2)
            ),
            _fact(space.id, blake, "Claude", "Dates", "Jan 10 to 12", now - timedelta(hours=5)),
            _fact(space.id, alex, VIA_WEB, "Headcount", "6 people", now - timedelta(hours=2)),
        ]
    )
    return space


def _add_book_club(db: Session, blake: User, now: datetime) -> Space:
    space = _add_space(db, blake, CLUB_SPACE, now - timedelta(hours=27), (blake,))
    db.add(_note(space.id, blake, "ChatGPT", "March pick", CLUB_PICK, now - timedelta(hours=26)))
    return space


def _has_open_invite(db: Session, space: Space, email: str, now: datetime) -> bool:
    return (
        db.scalar(
            select(Invite.token_hash)
            .where(
                Invite.space_id == space.id,
                Invite.email == email,
                Invite.accepted_at.is_(None),
                Invite.revoked_at.is_(None),
                Invite.expires_at > now,
            )
            .limit(1)
        )
        is not None
    )


def _ensure_invite(
    db: Session, space: Space, inviter: User, invitee: User, sent_at: datetime, now: datetime
) -> None:
    if db.get(SpaceMember, (space.id, invitee.id)) is not None:
        return
    if _has_open_invite(db, space, invitee.email, now):
        return
    db.add(
        Invite(
            token_hash=hash_token(new_token()),
            space_id=space.id,
            invited_by=inviter.id,
            email=invitee.email,
            expires_at=sent_at + INVITE_TTL,
            accepted_by=None,
            accepted_at=None,
            revoked_at=None,
        )
    )


def ensure_demo_data(db: Session, env: Env) -> None:
    now = env.now()
    alex = _ensure_user(db, ALEX, now - timedelta(hours=30))
    blake = _ensure_user(db, BLAKE, now - timedelta(hours=30))
    _ensure_space(db, alex, SAMPLE_SPACE, lambda: _add_goa_trip(db, alex, blake, now))
    lisbon = _ensure_space(db, alex, EMPTY_SPACE, lambda: _add_lisbon(db, alex, now))
    _ensure_space(db, blake, CABIN_SPACE, lambda: _add_cabin_weekend(db, alex, blake, now))
    book_club = _ensure_space(db, blake, CLUB_SPACE, lambda: _add_book_club(db, blake, now))
    _ensure_invite(db, lisbon, alex, blake, now - timedelta(hours=3), now)
    _ensure_invite(db, book_club, blake, alex, now - timedelta(hours=26), now)
    db.commit()
