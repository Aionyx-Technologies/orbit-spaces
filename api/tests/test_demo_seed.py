from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from orbit.limits import INVITE_TTL
from orbit.models import Invite, Item, Memory, Space, SpaceMember, User
from orbit.services import invites as invites_service
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import spaces as spaces_service
from orbit.services.context import Env
from orbit.services.demo import (
    ALEX,
    BLAKE,
    CABIN_SPACE,
    CLUB_SPACE,
    EMPTY_SPACE,
    SAMPLE_PLAN,
    SAMPLE_SPACE,
    DemoPerson,
    ensure_demo_data,
)
from tests.conftest import Factory, FakeClock, Person

TABLES = (User, Space, SpaceMember, Item, Memory, Invite)


def snapshot(db: Session) -> dict[str, set[str]]:
    return {
        table.__tablename__: {repr(tuple(row)) for row in db.execute(select(table.__table__))}
        for table in TABLES
    }


def seed(db: Session, env: Env, clock: FakeClock) -> datetime:
    now = clock.current
    ensure_demo_data(db, env)
    return now


def user_of(db: Session, person: DemoPerson) -> User:
    user = db.scalar(select(User).where(User.email == person.email))
    assert user is not None
    return user


def space_named(db: Session, name: str) -> Space:
    space = db.scalar(select(Space).where(Space.name == name, Space.deleted_at.is_(None)))
    assert space is not None
    return space


def names_in(db: Session, space: Space) -> list[str]:
    return sorted(
        db.scalars(
            select(User.display_name)
            .join(SpaceMember, SpaceMember.user_id == User.id)
            .where(SpaceMember.space_id == space.id)
        )
    )


def items_in(db: Session, space: Space) -> list[Item]:
    return list(db.scalars(select(Item).where(Item.space_id == space.id).order_by(Item.created_at)))


def facts_in(db: Session, space: Space) -> list[Memory]:
    return list(
        db.scalars(
            select(Memory)
            .where(Memory.space_id == space.id)
            .order_by(Memory.created_at, Memory.key)
        )
    )


def invites_to(db: Session, space: Space) -> list[Invite]:
    return list(
        db.scalars(select(Invite).where(Invite.space_id == space.id).order_by(Invite.expires_at))
    )


def test_a_fresh_database_gets_four_spaces_owned_and_shared_as_designed(
    db: Session, env: Env, clock: FakeClock
) -> None:
    seed(db, env, clock)
    alex, blake = user_of(db, ALEX), user_of(db, BLAKE)

    spaces = {space.name: space for space in db.scalars(select(Space))}

    assert set(spaces) == {SAMPLE_SPACE, EMPTY_SPACE, CABIN_SPACE, CLUB_SPACE}
    assert {name: space.created_by for name, space in spaces.items()} == {
        SAMPLE_SPACE: alex.id,
        EMPTY_SPACE: alex.id,
        CABIN_SPACE: blake.id,
        CLUB_SPACE: blake.id,
    }
    assert {name: names_in(db, space) for name, space in spaces.items()} == {
        SAMPLE_SPACE: ["Alex", "Blake"],
        EMPTY_SPACE: ["Alex"],
        CABIN_SPACE: ["Alex", "Blake"],
        CLUB_SPACE: ["Blake"],
    }


def test_the_cabin_weekend_has_two_notes_two_facts_and_no_plan(
    db: Session, env: Env, clock: FakeClock
) -> None:
    now = seed(db, env, clock)
    cabin = space_named(db, CABIN_SPACE)
    alex, blake = user_of(db, ALEX), user_of(db, BLAKE)

    assert cabin.created_at == now - timedelta(hours=6)
    assert [
        (item.title, item.kind, item.via, item.author_kind, item.shared_by, item.created_at)
        for item in items_in(db, cabin)
    ] == [
        ("Cabin shortlist", "note", "Claude", "assistant", blake.id, now - timedelta(hours=5)),
        ("Grocery run", "note", "web", "person", alex.id, now - timedelta(hours=2)),
    ]
    assert [
        (fact.key, fact.value, fact.via, fact.set_by, fact.created_at, fact.superseded_at)
        for fact in facts_in(db, cabin)
    ] == [
        ("Dates", "Jan 10 to 12", "Claude", blake.id, now - timedelta(hours=5), None),
        ("Headcount", "6 people", "web", alex.id, now - timedelta(hours=2), None),
    ]


def test_the_book_club_has_one_note_by_blake_and_nothing_else(
    db: Session, env: Env, clock: FakeClock
) -> None:
    now = seed(db, env, clock)
    club = space_named(db, CLUB_SPACE)
    blake = user_of(db, BLAKE)

    assert club.created_at == now - timedelta(hours=27)
    assert [
        (item.title, item.kind, item.via, item.author_kind, item.shared_by, item.created_at)
        for item in items_in(db, club)
    ] == [("March pick", "note", "ChatGPT", "assistant", blake.id, now - timedelta(hours=26))]
    assert facts_in(db, club) == []


def test_the_goa_trip_and_lisbon_are_seeded_exactly_as_they_always_were(
    db: Session, env: Env, clock: FakeClock
) -> None:
    now = seed(db, env, clock)
    goa, lisbon = space_named(db, SAMPLE_SPACE), space_named(db, EMPTY_SPACE)
    alex, blake = user_of(db, ALEX), user_of(db, BLAKE)
    flight, packing, hotels, plan = items_in(db, goa)

    assert goa.created_at == now - timedelta(hours=30)
    assert lisbon.created_at == now - timedelta(hours=1)
    assert [
        (item.title, item.kind, item.via, item.author_kind, item.shared_by, item.created_at)
        for item in (flight, packing, hotels, plan)
    ] == [
        ("Morning flight", "note", "ChatGPT", "assistant", alex.id, now - timedelta(hours=26)),
        ("Packing list", "note", "web", "person", alex.id, now - timedelta(hours=20)),
        ("Hotel shortlist", "note", "Grok", "assistant", blake.id, now - timedelta(hours=3)),
        ("Combined plan", "plan", "orbit", "orbit", None, now - timedelta(minutes=20)),
    ]
    assert flight.content == (
        "Leaves Dec 20 at 7:10, lands at 9:25.\nEconomy fares are about $210 each."
    )
    assert packing.content == (
        "Passports and printouts of the e-visa\nSunscreen, SPF 50\nLight rain jacket\n"
        "Power adapter (type D)"
    )
    assert hotels.content == (
        "Seaside Inn: $120 a night, 5 minutes from the beach.\n"
        "Palm View: $150 a night, pool and breakfast included."
    )
    assert plan.content == SAMPLE_PLAN
    assert plan.source_item_ids == [flight.id, packing.id, hotels.id]
    assert [(fact.key, fact.value, fact.via, fact.set_by) for fact in facts_in(db, goa)] == [
        ("Dates", "Dec 20 to 23", "ChatGPT", alex.id),
        ("Budget", "$3,000 for the two of us", "Grok", blake.id),
        ("Hotel", "Seaside Inn (not confirmed)", "Grok", blake.id),
    ]
    joined = db.scalars(select(SpaceMember.joined_at).where(SpaceMember.space_id == goa.id)).all()
    assert joined == [goa.created_at, goa.created_at]
    assert items_in(db, lisbon) == []
    assert facts_in(db, lisbon) == []
    assert names_in(db, lisbon) == ["Alex"]


def test_each_demo_person_is_invited_to_a_space_of_the_other_one(
    db: Session, env: Env, clock: FakeClock
) -> None:
    now = seed(db, env, clock)
    alex, blake = user_of(db, ALEX), user_of(db, BLAKE)
    [to_blake] = invites_to(db, space_named(db, EMPTY_SPACE))
    [to_alex] = invites_to(db, space_named(db, CLUB_SPACE))

    assert (to_blake.email, to_blake.invited_by) == (BLAKE.email, alex.id)
    assert (to_alex.email, to_alex.invited_by) == (ALEX.email, blake.id)
    assert to_blake.expires_at == now - timedelta(hours=3) + INVITE_TTL
    assert to_alex.expires_at == now - timedelta(hours=26) + INVITE_TTL
    for invite in (to_blake, to_alex):
        assert (invite.accepted_by, invite.accepted_at, invite.revoked_at) == (None, None, None)
        assert len(invite.token_hash) == 64
    assert to_blake.token_hash != to_alex.token_hash
    assert len(db.scalars(select(Invite)).all()) == 2
    assert env.mailer.pending_count == 0


def test_the_invitations_show_up_as_pending_for_the_right_people(
    db: Session, env: Env, clock: FakeClock
) -> None:
    now = seed(db, env, clock)

    for_blake = invites_service.list_pending_invitations(db, env, user_of(db, BLAKE))
    for_alex = invites_service.list_pending_invitations(db, env, user_of(db, ALEX))

    assert [(row.space_name, row.invited_by, row.invited_at) for row in for_blake] == [
        (EMPTY_SPACE, "Alex", now - timedelta(hours=3))
    ]
    assert [(row.space_name, row.invited_by, row.invited_at) for row in for_alex] == [
        (CLUB_SPACE, "Blake", now - timedelta(hours=26))
    ]


def test_running_it_again_changes_nothing(db: Session, env: Env, clock: FakeClock) -> None:
    seed(db, env, clock)
    before = snapshot(db)

    clock.advance(hours=2)
    ensure_demo_data(db, env)
    ensure_demo_data(db, env)

    assert snapshot(db) == before


def test_a_database_with_only_the_old_seed_gets_the_new_spaces_without_touching_anything(
    db: Session, env: Env, clock: FakeClock, make: Factory
) -> None:
    seed(db, env, clock)
    db.execute(delete(Invite))
    db.execute(delete(Space).where(Space.name.in_([CABIN_SPACE, CLUB_SPACE])))
    db.commit()
    alex = Person(id=user_of(db, ALEX).id, email=ALEX.email, name=ALEX.name)
    blake = Person(id=user_of(db, BLAKE).id, email=BLAKE.email, name=BLAKE.name)
    friend = make.user("mailsaipraveen@example.com", "Mailsaipraveen")
    florida = make.space(alex, "Florida Airbnb", friend)
    make.space(blake, "Vegas Trip")
    items_service.share_item(db, env, friend.web(), florida.id, "Listing", "Two bedrooms")
    memory_service.set_fact(db, env, alex.web(), florida.id, "Dates", "March")
    assert {space.name for space in db.scalars(select(Space))} == {
        SAMPLE_SPACE,
        EMPTY_SPACE,
        "Florida Airbnb",
        "Vegas Trip",
    }
    assert db.scalars(select(Invite)).all() == []
    before = snapshot(db)

    ensure_demo_data(db, env)

    after = snapshot(db)
    for table, rows in before.items():
        assert rows <= after[table], table
    assert {space.name for space in db.scalars(select(Space))} == {
        SAMPLE_SPACE,
        EMPTY_SPACE,
        "Florida Airbnb",
        "Vegas Trip",
        CABIN_SPACE,
        CLUB_SPACE,
    }
    added = {table: len(after[table] - before[table]) for table in after}
    assert added == {
        "users": 0,
        "spaces": 2,
        "space_members": 3,
        "items": 3,
        "memory": 2,
        "invites": 2,
    }


def test_a_space_a_person_already_made_with_a_demo_name_is_kept_and_not_filled(
    db: Session, env: Env, clock: FakeClock, make: Factory
) -> None:
    blake = make.user(BLAKE.email, BLAKE.name)
    own = make.space(blake, CLUB_SPACE)

    seed(db, env, clock)

    clubs = db.scalars(select(Space).where(Space.name == CLUB_SPACE)).all()
    assert [club.id for club in clubs] == [own.id]
    assert items_in(db, clubs[0]) == []
    assert [invite.email for invite in invites_to(db, clubs[0])] == [ALEX.email]
    assert len(db.scalars(select(User).where(User.email == BLAKE.email)).all()) == 1


def test_a_deleted_demo_space_is_made_again(db: Session, env: Env, clock: FakeClock) -> None:
    seed(db, env, clock)
    gone = space_named(db, CABIN_SPACE)
    spaces_service.purge_space(db, gone, clock.current)
    db.commit()

    ensure_demo_data(db, env)

    fresh = space_named(db, CABIN_SPACE)
    assert fresh.id != gone.id
    assert len(items_in(db, fresh)) == 2
    assert items_in(db, gone) == []


def test_a_space_marked_deleted_is_never_matched_by_its_name(
    db: Session, env: Env, clock: FakeClock
) -> None:
    seed(db, env, clock)
    gone = space_named(db, CABIN_SPACE)
    gone.deleted_at = clock.current
    db.commit()

    ensure_demo_data(db, env)

    fresh = space_named(db, CABIN_SPACE)
    assert fresh.id != gone.id
    assert len(items_in(db, fresh)) == 2


def test_an_invitation_that_is_already_open_is_not_duplicated(
    db: Session, env: Env, clock: FakeClock, make: Factory
) -> None:
    alex = make.user(ALEX.email, ALEX.name)
    make.user(BLAKE.email, BLAKE.name)
    lisbon = make.space(alex, EMPTY_SPACE)
    invites_service.create_invite(db, env, alex.web(), lisbon.id, BLAKE.email)

    seed(db, env, clock)

    assert len(invites_to(db, space_named(db, EMPTY_SPACE))) == 1


def test_nobody_is_invited_to_a_space_they_are_already_in(
    db: Session, env: Env, clock: FakeClock
) -> None:
    seed(db, env, clock)
    db.execute(delete(Invite))
    lisbon = space_named(db, EMPTY_SPACE)
    db.add(SpaceMember(space_id=lisbon.id, user_id=user_of(db, BLAKE).id, joined_at=clock.current))
    db.commit()

    ensure_demo_data(db, env)

    assert invites_to(db, lisbon) == []
    assert len(invites_to(db, space_named(db, CLUB_SPACE))) == 1


def test_a_declined_demo_invitation_comes_back_at_the_next_sign_in(
    db: Session, env: Env, clock: FakeClock
) -> None:
    seed(db, env, clock)
    blake = user_of(db, BLAKE)
    [pending] = invites_service.list_pending_invitations(db, env, blake)
    invites_service.decline_invitation(db, env, blake, pending.id)
    assert invites_service.list_pending_invitations(db, env, blake) == []

    ensure_demo_data(db, env)

    [restored] = invites_service.list_pending_invitations(db, env, blake)
    assert restored.space_name == EMPTY_SPACE
    assert restored.id != pending.id
    assert len(invites_to(db, space_named(db, EMPTY_SPACE))) == 2


def test_an_accepted_demo_invitation_does_not_come_back(
    db: Session, env: Env, clock: FakeClock
) -> None:
    seed(db, env, clock)
    blake = user_of(db, BLAKE)
    [pending] = invites_service.list_pending_invitations(db, env, blake)
    invites_service.accept_invitation(db, env, blake, pending.id)

    ensure_demo_data(db, env)

    lisbon = space_named(db, EMPTY_SPACE)
    assert invites_service.list_pending_invitations(db, env, blake) == []
    assert len(invites_to(db, lisbon)) == 1
    assert names_in(db, lisbon) == ["Alex", "Blake"]


def test_an_expired_demo_invitation_is_replaced_by_a_fresh_one(
    db: Session, env: Env, clock: FakeClock
) -> None:
    seed(db, env, clock)
    clock.advance(days=8)
    blake = user_of(db, BLAKE)
    assert invites_service.list_pending_invitations(db, env, blake) == []

    ensure_demo_data(db, env)

    [fresh] = invites_service.list_pending_invitations(db, env, blake)
    assert fresh.space_name == EMPTY_SPACE
    assert len(invites_to(db, space_named(db, EMPTY_SPACE))) == 2
