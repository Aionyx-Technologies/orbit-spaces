from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit import models
from orbit.errors import InvalidInput, TooLong
from orbit.limits import DISPLAY_NAME_MAX
from orbit.models import Invite, Item, MagicLink, Memory, Space, SpaceMember, User
from orbit.security import hash_token
from orbit.services import accounts as accounts_service
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import spaces as spaces_service
from orbit.services.context import Env
from orbit.services.views import SpaceView
from tests.conftest import Factory, Person


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


@pytest.fixture
def carol(make: Factory) -> Person:
    return make.user("carol@example.com", "Carol")


def load_user(db: Session, person: Person) -> User:
    user = db.get(User, person.id)
    assert user is not None
    return user


def count(db: Session, model: type[models.Base]) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_a_profile_name_is_cleaned_and_limited(db: Session, alex: Person) -> None:
    user = load_user(db, alex)
    too_long = "n" * (DISPLAY_NAME_MAX + 1)

    updated = accounts_service.update_profile(db, user, "  Alex \n Smith ")

    assert updated.display_name == "Alex Smith"
    with pytest.raises(InvalidInput):
        accounts_service.update_profile(db, user, "   ")
    with pytest.raises(TooLong):
        accounts_service.update_profile(db, user, too_long)
    assert load_user(db, alex).display_name == "Alex Smith"


def test_deleting_an_account_removes_the_person_and_what_ties_to_them(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person
) -> None:
    space = make.space(alex, "Shared", blake)
    now = env.now()
    db.add(
        models.WebSession(
            token_hash=hash_token("s"),
            user_id=alex.id,
            expires_at=now + timedelta(days=1),
            created_at=now,
        )
    )
    db.add(
        MagicLink(
            token_hash=hash_token("m"),
            email=alex.email,
            purpose="sign_in",
            expires_at=now,
            used_at=None,
        )
    )
    db.add(models.Waitlist(email=alex.email, created_at=now))
    db.commit()

    accounts_service.delete_account(db, env, load_user(db, alex))

    assert db.get(User, alex.id) is None
    assert db.get(SpaceMember, (space.id, alex.id)) is None
    assert count(db, models.WebSession) == 0
    assert count(db, MagicLink) == 0
    assert count(db, models.Waitlist) == 0
    assert db.get(User, blake.id) is not None


def test_their_items_are_retracted_and_scrubbed_but_other_peoples_stay(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person
) -> None:
    space = make.space(alex, "Shared", blake)
    mine = items_service.share_item(db, env, alex.web(), space.id, "Mine", "Private words")
    theirs = items_service.share_item(db, env, blake.web(), space.id, "Theirs", "Still here")

    accounts_service.delete_account(db, env, load_user(db, alex))

    gone = db.get(Item, mine.id)
    kept = db.get(Item, theirs.id)
    assert gone is not None
    assert gone.retracted_at is not None
    assert (gone.title, gone.content, gone.shared_by) == ("", "", None)
    assert kept is not None
    assert (kept.title, kept.content, kept.retracted_at) == ("Theirs", "Still here", None)
    visible = items_service.list_items(db, blake.id, space.id).items
    assert [item.title for item in visible] == ["Theirs"]


def test_facts_they_set_stay_in_the_space_without_their_name(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person
) -> None:
    space = make.space(alex, "Shared", blake)
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")

    accounts_service.delete_account(db, env, load_user(db, alex))

    facts = memory_service.current_facts(db, space.id)
    assert [(fact.key, fact.value, fact.set_by_name) for fact in facts] == [
        ("Dates", "Dec 20", None)
    ]
    history = db.scalars(select(Memory)).all()
    assert [row.set_by for row in history] == [None]


def test_a_shared_space_they_created_passes_to_the_longest_standing_member(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person, carol: Person
) -> None:
    space = make.space(alex, "Shared", blake, carol)

    accounts_service.delete_account(db, env, load_user(db, alex))

    row = db.get(Space, space.id)
    assert row is not None
    assert row.deleted_at is None
    assert row.created_by == blake.id


def test_a_space_only_they_were_in_is_deleted_with_its_content(
    db: Session, env: Env, make: Factory, alex: Person
) -> None:
    space = make.space(alex, "Solo")
    items_service.share_item(db, env, alex.web(), space.id, "Note", "Body")
    memory_service.set_fact(db, env, alex.web(), space.id, "K", "V")

    accounts_service.delete_account(db, env, load_user(db, alex))

    row = db.get(Space, space.id)
    assert row is not None
    assert row.deleted_at is not None
    assert row.name == ""
    assert count(db, Item) == 0
    assert count(db, Memory) == 0


def test_spaces_they_only_joined_are_left_alone(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person
) -> None:
    space: SpaceView = make.space(blake, "Blakes", alex)

    accounts_service.delete_account(db, env, load_user(db, alex))

    row = db.get(Space, space.id)
    assert row is not None
    assert (row.deleted_at, row.created_by) == (None, blake.id)
    assert [
        member.user_id for member in spaces_service.get_space_view(db, blake.id, space.id).members
    ] == [blake.id]


def test_invites_they_sent_that_nobody_used_are_revoked(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person
) -> None:
    space = make.space(alex, "Shared", blake)
    now = env.now()
    for name, accepted in (("open", None), ("used", now)):
        db.add(
            Invite(
                token_hash=hash_token(name),
                space_id=space.id,
                invited_by=alex.id,
                email=None,
                expires_at=now + timedelta(days=7),
                accepted_by=blake.id if accepted else None,
                accepted_at=accepted,
                revoked_at=None,
            )
        )
    db.commit()

    accounts_service.delete_account(db, env, load_user(db, alex))

    open_invite = db.get(Invite, hash_token("open"))
    used_invite = db.get(Invite, hash_token("used"))
    assert open_invite is not None
    assert open_invite.revoked_at is not None
    assert used_invite is not None
    assert used_invite.revoked_at is None
    assert used_invite.invited_by is None


def invite_row(
    db: Session,
    env: Env,
    name: str,
    space_id: str,
    invited_by: str,
    email: str | None,
    accepted_by: str | None = None,
) -> None:
    now = env.now()
    db.add(
        Invite(
            token_hash=hash_token(name),
            space_id=space_id,
            invited_by=invited_by,
            email=email,
            expires_at=now + timedelta(days=7),
            accepted_by=accepted_by,
            accepted_at=now if accepted_by else None,
            revoked_at=None,
        )
    )
    db.commit()


def test_invitations_sent_to_their_email_are_cancelled_and_lose_the_address(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person, carol: Person
) -> None:
    space = make.space(blake, "Blakes", carol)
    invite_row(db, env, "waiting", space.id, blake.id, alex.email)
    invite_row(db, env, "accepted", space.id, blake.id, alex.email, accepted_by=alex.id)

    accounts_service.delete_account(db, env, load_user(db, alex))

    waiting = db.get(Invite, hash_token("waiting"))
    accepted = db.get(Invite, hash_token("accepted"))
    assert waiting is not None
    assert waiting.revoked_at is not None
    assert waiting.email is None
    assert accepted is not None
    assert accepted.revoked_at is None
    assert accepted.email is None
    assert db.scalars(select(Invite).where(Invite.email == alex.email)).all() == []


def test_a_waiting_invitation_never_turns_into_an_open_link(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person
) -> None:
    space = make.space(blake, "Blakes")
    invite_row(db, env, "waiting", space.id, blake.id, alex.email)

    accounts_service.delete_account(db, env, load_user(db, alex))

    row = db.get(Invite, hash_token("waiting"))
    assert row is not None
    assert row.email is None
    assert row.revoked_at is not None
    assert row.accepted_at is None


def test_addresses_they_invited_are_erased_from_invitations_nobody_accepted(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person
) -> None:
    space = make.space(alex, "Shared", blake)
    invite_row(db, env, "unused", space.id, alex.id, "friend@example.com")
    invite_row(db, env, "used", space.id, alex.id, "blake@example.com", accepted_by=blake.id)

    accounts_service.delete_account(db, env, load_user(db, alex))

    unused = db.get(Invite, hash_token("unused"))
    assert unused is not None
    assert unused.revoked_at is not None
    assert unused.email is None
    assert db.scalars(select(Invite).where(Invite.email == "friend@example.com")).all() == []
