from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from orbit.auth.magic_links import request_sign_in_link
from orbit.background import stop_background_tasks
from orbit.db import SessionFactory
from orbit.models import BillingAccount, CreditGrant, EmailSend, Space, new_id
from orbit.services import invites as invites_service
from orbit.services import items as items_service
from orbit.services.billing_state import grant_remaining
from orbit.services.context import Env
from orbit.services.views import SpaceView
from tests.conftest import Factory, FakeClock, Person, RecordingSender
from tests.test_notify_frequency import KOLKATA, at, choose, instant, summaries

CAP = 5


@pytest.fixture
def mail(env: Env) -> RecordingSender:
    recorder = RecordingSender()
    env.mailer.sender = recorder
    return recorder


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


@pytest.fixture
def carol(make: Factory) -> Person:
    return make.user("carol@example.com", "Carol")


@pytest.fixture
def space(make: Factory, alex: Person, blake: Person, carol: Person) -> SpaceView:
    return make.space(alex, "Goa trip", blake, carol)


@pytest.fixture
def capped(env: Env) -> Env:
    env.settings.max_update_emails_per_day = CAP
    return env


def share(db: Session, env: Env, alex: Person, space: SpaceView, title: str) -> None:
    items_service.share_item(db, env, alex.web(), space.id, title, "Body")


def fill_the_allowance(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    for index in range(CAP):
        share(db, env, alex, space, f"Plan {index}")
        sent = instant(env, session_factory, mail)
        assert blake.email in [message.to for message in sent]


def test_the_sixth_update_email_in_a_day_is_held_back(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)

    share(db, capped, alex, space, "Sixth")
    sent = instant(capped, session_factory, mail)

    assert blake.email not in [message.to for message in sent]
    assert capped.notifier.pending_count > 0


def test_held_back_updates_arrive_in_the_next_morning_summary(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Sixth")
    instant(capped, session_factory, mail)

    clock.current = at(20, 9)
    morning = summaries(capped, session_factory, mail)

    to_blake = [message for message in morning if message.to == blake.email]
    assert len(to_blake) == 1
    assert 'Alex shared "Sixth"' in to_blake[0].text
    assert 'Alex shared "Plan 0"' not in to_blake[0].text
    assert capped.notifier.pending_count == 0


def test_the_cap_window_rolls_after_a_day(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Held")
    instant(capped, session_factory, mail)

    clock.current = at(20, 10, 5)
    share(db, capped, alex, space, "Fresh")
    sent = instant(capped, session_factory, mail)

    assert blake.email in [message.to for message in sent]


def test_cap_zero_means_unlimited(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    for index in range(CAP + 3):
        share(db, env, alex, space, f"Plan {index}")
        sent = instant(env, session_factory, mail)
        assert blake.email in [message.to for message in sent]


def test_the_cap_is_per_person(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
    carol: Person,
) -> None:
    duo = make.space(alex, "Duo", blake)
    elsewhere = make.space(alex, "Elsewhere", carol)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, duo)

    share(db, capped, alex, duo, "Sixth")
    held = instant(capped, session_factory, mail)
    share(db, capped, alex, elsewhere, "Fresh")
    fresh = instant(capped, session_factory, mail)

    assert blake.email not in [message.to for message in held]
    assert carol.email in [message.to for message in fresh]


def test_sign_in_and_invite_emails_ignore_the_cap(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
) -> None:
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    before = len(mail.messages)

    request_sign_in_link(db, capped, blake.email, "/", "", "203.0.113.9")
    invite = invites_service.create_invite(db, capped, blake.web(), space.id, "new@example.com")
    capped.mailer.drain()
    to_blake = [message for message in mail.messages[before:] if message.to == blake.email]

    assert len(to_blake) == 1
    assert any(message.to == "new@example.com" for message in mail.messages[before:])
    assert invite is not None


def test_the_invite_accepted_email_ignores_the_cap(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    before = len(mail.messages)
    newcomer = make.user("dana@example.com", "Dana")
    invite = invites_service.create_invite(db, capped, blake.web(), space.id, None)
    token = invite.url.rsplit("/", 1)[-1]

    invites_service.accept_invite(db, capped, newcomer.id, token)
    capped.mailer.drain()

    assert [message.to for message in mail.messages[before:]] == [blake.email]


def test_people_who_chose_off_never_get_an_overflow_summary(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Sixth")
    instant(capped, session_factory, mail)
    choose(db, blake, "off")

    clock.current = at(20, 9)
    morning = summaries(capped, session_factory, mail)

    assert blake.email not in [message.to for message in morning]
    assert capped.notifier.pending_count == 0


def test_overflow_waits_for_eight_in_the_persons_time_zone(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "instant", KOLKATA)
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Sixth")
    instant(capped, session_factory, mail)

    clock.current = at(20, 2, 29)
    too_early = summaries(capped, session_factory, mail)
    clock.current = at(20, 2, 31)
    on_time = summaries(capped, session_factory, mail)

    assert blake.email not in [message.to for message in too_early]
    assert [message.to for message in on_time if message.to == blake.email] == [blake.email]


def test_overflow_for_a_deleted_space_is_dropped_quietly(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Sixth")
    instant(capped, session_factory, mail)
    row = db.get(Space, space.id)
    assert row is not None
    row.deleted_at = capped.now()
    db.commit()

    clock.current = at(20, 9)
    morning = summaries(capped, session_factory, mail)

    assert blake.email not in [message.to for message in morning]
    assert capped.notifier.pending_count == 0


def test_the_summary_for_overflow_is_exempt_from_the_cap(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Sixth")
    instant(capped, session_factory, mail)

    clock.current = at(20, 9)
    share(db, capped, alex, space, "Seventh")
    still_held = instant(capped, session_factory, mail)
    morning = summaries(capped, session_factory, mail)

    assert blake.email not in [message.to for message in still_held]
    assert blake.email in [message.to for message in morning]


def test_updates_held_by_the_cap_are_still_sent_when_the_app_shuts_down(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Last words")

    asyncio.run(stop_background_tasks([], capped, session_factory))

    last = [m for m in mail.to(blake.email) if "Last words" in m.text]
    assert len(last) == 1


def test_an_update_held_just_after_the_summary_waits_for_tomorrows(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Sixth")
    instant(capped, session_factory, mail)
    clock.current = at(20, 7, 57)
    share(db, capped, alex, space, "Late")

    clock.current = at(20, 8, 0)
    first = summaries(capped, session_factory, mail)
    clock.current = at(20, 8, 2)
    instant(capped, session_factory, mail)
    clock.current = at(20, 8, 5)
    second = summaries(capped, session_factory, mail)
    clock.current = at(21, 8, 1)
    next_day = summaries(capped, session_factory, mail)

    assert [m.to for m in first if m.to == blake.email] == [blake.email]
    assert 'Alex shared "Sixth"' in first[0].text
    assert blake.email not in [m.to for m in second]
    assert 'Alex shared "Late"' in next(m for m in next_day if m.to == blake.email).text


def test_the_summary_for_held_back_updates_names_the_daily_limit(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    clock.current = at(19, 10)
    fill_the_allowance(db, capped, session_factory, mail, alex, blake, space)
    share(db, capped, alex, space, "Sixth")
    instant(capped, session_factory, mail)

    clock.current = at(20, 9)
    morning = summaries(capped, session_factory, mail)

    summary = next(m for m in morning if m.to == blake.email)
    assert f"limit of {CAP} update emails a day" in summary.text


def test_a_daily_summary_people_chose_does_not_mention_a_limit(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(19, 10)
    share(db, capped, alex, space, "Hotels")

    clock.current = at(20, 9)
    morning = summaries(capped, session_factory, mail)

    summary = next(m for m in morning if m.to == blake.email)
    assert "limit of" not in summary.text


def test_the_last_update_email_of_the_day_says_the_rest_will_wait(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    received = []
    for index in range(CAP):
        share(db, capped, alex, space, f"Plan {index}")
        received += [m for m in instant(capped, session_factory, mail) if m.to == blake.email]

    assert len(received) == CAP
    for earlier in received[:-1]:
        assert "limit of" not in earlier.text
    last = received[-1]
    assert f"limit of {CAP} update emails a day" in last.text
    assert "next morning summary" in last.text
    assert last.html is not None
    assert f"limit of {CAP} update emails a day" in last.html


def test_no_limit_note_without_a_cap(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    for index in range(CAP):
        share(db, env, alex, space, f"Plan {index}")
        sent = instant(env, session_factory, mail)
        assert all("limit of" not in m.text for m in sent)


def test_a_plus_person_is_told_their_own_limit(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    db.add(
        BillingAccount(
            user_id=blake.id,
            stripe_customer_id="cus_blake",
            plan="plus",
            status="active",
            period_start=capped.now(),
            period_end=capped.now() + timedelta(days=30),
            updated_at=capped.now(),
        )
    )
    db.add_all(EmailSend(id=new_id(), user_id=blake.id, sent_at=capped.now()) for _ in range(99))
    db.commit()

    share(db, capped, alex, space, "Hundredth")
    sent = instant(capped, session_factory, mail)

    to_blake = [message for message in sent if message.to == blake.email]
    assert len(to_blake) == 1
    assert "limit of 100" in to_blake[0].text


def test_a_failing_allowance_for_one_person_holds_only_their_mail(
    db: Session,
    capped: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    from orbit.services import email_allowance

    real_try_send = email_allowance.try_send

    def flaky(db: Session, settings: object, user_id: str, now: object) -> bool:
        if user_id == blake.id:
            raise RuntimeError(f"database is locked for {user_id}")
        return real_try_send(db, settings, user_id, now)  # type: ignore[arg-type]

    monkeypatch.setattr(email_allowance, "try_send", flaky)
    clock.current = at(19, 10)
    share(db, capped, alex, space, "Villa")

    with caplog.at_level(logging.WARNING):
        sent = instant(capped, session_factory, mail)

    assert [message.to for message in sent] == [carol.email]
    assert "RuntimeError" in caplog.text
    assert blake.id not in caplog.text
    assert capped.notifier.pending_count == 1

    monkeypatch.undo()
    clock.current = at(20, 9)
    morning = summaries(capped, session_factory, mail)
    to_blake = [message for message in morning if message.to == blake.email]
    assert len(to_blake) == 1
    assert 'Alex shared "Villa"' in to_blake[0].text
    assert capped.notifier.pending_count == 0


def test_a_person_past_the_cap_with_an_email_pack_still_gets_the_email(
    db: Session,
    capped: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    grant = CreditGrant(
        id=new_id(),
        user_id=blake.id,
        kind="email",
        amount=500,
        expires_at=capped.now() + timedelta(days=300),
        stripe_event_id=f"evt_{new_id()}",
        created_at=capped.now(),
    )
    db.add(grant)
    db.add_all(EmailSend(id=new_id(), user_id=blake.id, sent_at=capped.now()) for _ in range(CAP))
    db.commit()

    share(db, capped, alex, space, "Past the cap")
    sent = instant(capped, session_factory, mail)

    to_blake = [message for message in sent if message.to == blake.email]
    assert len(to_blake) == 1
    assert "limit" not in to_blake[0].text
    db.expire_all()
    assert grant_remaining(db, grant) == 499
