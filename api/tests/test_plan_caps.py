from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import delete
from sqlalchemy.orm import Session

from orbit.errors import LimitReached
from orbit.models import BillingAccount, Space, SpaceMember
from orbit.services import billing_state
from orbit.services import invites as invites_service
from orbit.services import spaces as spaces_service
from orbit.services.context import Env
from tests.conftest import Factory, Person


@pytest.fixture(autouse=True)
def free_created_cap(env: Env) -> None:
    env.settings.max_created_spaces = 5


def go_plus(db: Session, env: Env, person: Person) -> None:
    db.add(
        BillingAccount(
            user_id=person.id,
            stripe_customer_id=f"cus_{person.id}",
            plan="plus",
            status="active",
            period_start=env.now(),
            period_end=env.now() + timedelta(days=30),
            updated_at=env.now(),
        )
    )
    db.commit()


def cancel(db: Session, person: Person) -> None:
    db.execute(delete(BillingAccount).where(BillingAccount.user_id == person.id))
    db.commit()


def fill(db: Session, env: Env, make: Factory, space_id: str, total: int) -> None:
    have = spaces_service.count_members(db, space_id)
    for n in range(total - have):
        guest = make.user(f"guest{space_id[:4]}{have + n}@example.com")
        db.add(
            SpaceMember(space_id=space_id, user_id=guest.id, joined_at=env.now(), notify_email=True)
        )
    db.commit()


def test_a_plus_owner_can_create_more_than_five_spaces(
    db: Session, env: Env, make: Factory
) -> None:
    alex = make.user("alex@example.com")
    go_plus(db, env, alex)

    for n in range(7):
        spaces_service.create_space(db, env, alex.web(), f"Space {n}")

    assert spaces_service.can_start_space(db, env, alex.id)


def test_a_free_owner_is_stopped_at_the_created_cap(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com")
    for n in range(5):
        spaces_service.create_space(db, env, alex.web(), f"Space {n}")

    assert not spaces_service.can_start_space(db, env, alex.id)
    with pytest.raises(LimitReached):
        spaces_service.create_space(db, env, alex.web(), "One more")


def test_a_plus_owners_space_holds_25_people(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com")
    go_plus(db, env, alex)
    space = make.space(alex)
    fill(db, env, make, space.id, 24)

    invites_service.create_invite(db, env, alex.web(), space.id, None)
    fill(db, env, make, space.id, 25)

    with pytest.raises(LimitReached, match="25 people"):
        invites_service.create_invite(db, env, alex.web(), space.id, None)


def test_a_free_owners_space_still_holds_10(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com")
    space = make.space(alex)
    fill(db, env, make, space.id, 10)

    with pytest.raises(LimitReached, match="10 people"):
        invites_service.create_invite(db, env, alex.web(), space.id, None)


def test_the_owners_plan_decides_not_the_inviters(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com")
    sam = make.user("sam@example.com")
    go_plus(db, env, sam)
    space = make.space(alex, "Goa trip", sam)
    fill(db, env, make, space.id, 10)

    with pytest.raises(LimitReached):
        invites_service.create_invite(db, env, sam.web(), space.id, None)


def test_a_space_over_the_free_cap_after_cancelling_keeps_its_members_but_cannot_add(
    db: Session, env: Env, make: Factory
) -> None:
    alex = make.user("alex@example.com")
    go_plus(db, env, alex)
    space = make.space(alex)
    created = invites_service.create_invite(db, env, alex.web(), space.id, None)
    token = created.url.rsplit("/", 1)[1]
    fill(db, env, make, space.id, 15)
    cancel(db, alex)
    newcomer = make.user("newcomer@example.com")

    with pytest.raises(LimitReached):
        invites_service.create_invite(db, env, alex.web(), space.id, None)
    with pytest.raises(LimitReached):
        invites_service.accept_invite(db, env, newcomer.id, token)

    assert spaces_service.count_members(db, space.id) == 15


def test_a_space_whose_owner_is_gone_falls_back_to_the_free_cap(
    db: Session, env: Env, make: Factory
) -> None:
    alex = make.user("alex@example.com")
    space = make.space(alex)
    row = db.get(Space, space.id)
    assert row is not None
    row.created_by = None
    db.commit()

    assert billing_state.members_cap(db, env.settings, row, env.now()) == 10


def test_the_error_message_names_the_real_cap(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com")
    go_plus(db, env, alex)
    space = make.space(alex)
    created = invites_service.create_invite(db, env, alex.web(), space.id, None)
    token = created.url.rsplit("/", 1)[1]
    fill(db, env, make, space.id, 25)
    newcomer = make.user("newcomer@example.com")

    with pytest.raises(LimitReached, match="already has 25 people"):
        invites_service.accept_invite(db, env, newcomer.id, token)
