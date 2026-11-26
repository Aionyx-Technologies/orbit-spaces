from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from orbit.db import SessionFactory
from orbit.email import EmailMessage
from orbit.models import User
from orbit.services import accounts as accounts_service
from orbit.services import items as items_service
from orbit.services import profile as profile_service
from orbit.services import spaces as spaces_service
from orbit.services.context import Env
from orbit.services.notify import notify_invite_accepted
from orbit.services.views import SpaceView
from tests.conftest import Factory, FakeClock, Person, RecordingSender

KOLKATA = "Asia/Kolkata"


def at(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


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


def choose(db: Session, person: Person, frequency: str, time_zone: str = "UTC") -> None:
    user = db.get(User, person.id)
    assert user is not None
    profile_service.update_me(db, user, {"email_frequency": frequency, "time_zone": time_zone})


def instant(
    env: Env, session_factory: SessionFactory, mail: RecordingSender, force: bool = True
) -> list[EmailMessage]:
    before = len(mail.messages)
    env.notifier.flush_due(session_factory, force)
    env.mailer.drain()
    return mail.messages[before:]


def summaries(
    env: Env, session_factory: SessionFactory, mail: RecordingSender
) -> list[EmailMessage]:
    before = len(mail.messages)
    env.notifier.flush_daily(session_factory)
    env.mailer.drain()
    return mail.messages[before:]


def test_people_who_chose_off_get_no_activity_emails(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "off")

    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")
    sent = instant(env, session_factory, mail)

    assert [message.to for message in sent] == [carol.email]


def test_nothing_is_kept_waiting_for_a_person_who_chose_off(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    space = make.space(alex, "Goa trip", blake)
    choose(db, blake, "off")

    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")

    assert env.notifier.pending_count == 0


def test_people_who_chose_the_daily_summary_get_nothing_as_it_happens(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")

    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")
    sent = instant(env, session_factory, mail)

    assert [message.to for message in sent] == [carol.email]
    assert env.notifier.pending_count == 1


def test_the_summary_waits_for_eight_in_the_persons_time_zone(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily", KOLKATA)
    clock.current = at(19, 12)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")

    clock.current = at(20, 2, 29)
    too_early = summaries(env, session_factory, mail)
    clock.current = at(20, 2, 31)
    on_time = summaries(env, session_factory, mail)

    assert too_early == []
    assert [message.to for message in on_time] == [blake.email]


def test_a_summary_is_one_email_for_every_space_with_changes(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
) -> None:
    first = make.space(alex, "Goa trip", blake)
    second = make.space(alex, "Book club", blake)
    quiet = make.space(alex, "Quiet", blake)
    choose(db, blake, "daily")
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.via("ChatGPT"), first.id, "Hotels", "Body")
    items_service.share_item(db, env, alex.web(), first.id, "Flights", "Body")
    items_service.share_item(db, env, alex.web(), second.id, "March pick", "Body")

    clock.current = at(20, 9)
    [message] = summaries(env, session_factory, mail)

    assert message.subject == "Your Orbit summary: 3 updates in 2 spaces"
    assert "Goa trip" in message.html
    assert "Book club" in message.html
    assert quiet.name not in message.html
    assert 'Alex shared "Hotels" via ChatGPT' in message.text
    assert 'Alex shared "March pick" on the web' in message.text
    assert f"/spaces/{first.id}" in message.text
    assert f"/spaces/{second.id}" in message.text


def test_the_summary_names_the_day_in_the_persons_time_zone_and_links_to_settings(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily", KOLKATA)
    clock.current = at(19, 12)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")

    clock.current = at(20, 3)
    [message] = summaries(env, session_factory, mail)

    assert "Friday 20 November" in message.text
    assert "/settings" in message.text


def test_changes_made_after_this_mornings_hour_wait_for_tomorrows_summary(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily", KOLKATA)
    clock.current = at(20, 3)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")

    clock.current = at(20, 3, 30)
    same_morning = summaries(env, session_factory, mail)
    clock.current = at(21, 2, 31)
    next_morning = summaries(env, session_factory, mail)

    assert same_morning == []
    assert [message.to for message in next_morning] == [blake.email]
    assert 'Alex shared "Hotels"' in next_morning[0].text


def test_only_one_summary_goes_out_a_day(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")

    clock.current = at(20, 9)
    first = summaries(env, session_factory, mail)
    clock.current = at(20, 9, 5)
    second = summaries(env, session_factory, mail)
    clock.current = at(20, 18)
    third = summaries(env, session_factory, mail)

    assert len(first) == 1
    assert second == []
    assert third == []
    instant(env, session_factory, mail)
    assert env.notifier.pending_count == 0


def test_no_summary_is_sent_on_a_quiet_day(
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    db: Session,
    blake: Person,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(20, 9)

    assert summaries(env, session_factory, mail) == []


def test_a_space_turned_off_is_left_out_of_the_summary(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
) -> None:
    kept = make.space(alex, "Goa trip", blake)
    muted = make.space(alex, "Book club", blake)
    choose(db, blake, "daily")
    spaces_service.set_notify(db, blake.id, muted.id, False)
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), kept.id, "Hotels", "Body")
    items_service.share_item(db, env, alex.web(), muted.id, "March pick", "Body")

    clock.current = at(20, 9)
    [message] = summaries(env, session_factory, mail)

    assert "Goa trip" in message.html
    assert "Book club" not in message.html
    assert message.subject == "Your Orbit summary: 1 update in 1 space"


def test_a_space_turned_off_after_the_change_is_still_left_out(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")
    spaces_service.set_notify(db, blake.id, space.id, False)

    clock.current = at(20, 9)

    assert summaries(env, session_factory, mail) == []


def test_switching_away_from_the_daily_summary_drops_what_was_waiting(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")
    choose(db, blake, "instant")

    clock.current = at(20, 9)

    assert summaries(env, session_factory, mail) == []
    instant(env, session_factory, mail)
    assert env.notifier.pending_count == 0


def test_a_person_who_deleted_their_account_gets_no_summary(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")
    deleted = db.get(User, blake.id)
    assert deleted is not None
    accounts_service.delete_account(db, env, deleted)

    clock.current = at(20, 9)

    assert summaries(env, session_factory, mail) == []
    instant(env, session_factory, mail)
    assert env.notifier.pending_count == 0


def test_a_time_zone_that_stopped_being_valid_falls_back_to_utc(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    stored = db.get(User, blake.id)
    assert stored is not None
    stored.time_zone = "Gone/Missing"
    db.commit()
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")

    clock.current = at(20, 8, 30)

    assert len(summaries(env, session_factory, mail)) == 1


def test_a_summary_lists_titles_and_names_never_what_was_written(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Secret body text")

    clock.current = at(20, 9)
    [message] = summaries(env, session_factory, mail)

    assert "Secret body text" not in message.text
    assert "Secret body text" not in message.html


def test_many_changes_in_one_space_are_capped_like_the_other_emails(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    choose(db, blake, "daily")
    clock.current = at(19, 15)
    for number in range(25):
        items_service.share_item(db, env, alex.web(), space.id, f"Item {number}", "Body")

    clock.current = at(20, 9)
    [message] = summaries(env, session_factory, mail)

    assert "and 5 more" in message.text
    assert message.subject == "Your Orbit summary: 25 updates in 1 space"


def test_the_invite_accepted_email_respects_a_choice_of_off(
    db: Session,
    env: Env,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    make: Factory,
) -> None:
    joined = make.space(alex, "Goa trip", blake)
    space_row = spaces_service.require_member(db, alex.id, joined.id)

    choose(db, alex, "off")
    notify_invite_accepted(db, env.mailer, env.settings, space_row, alex.id, blake.id)
    env.mailer.drain()
    choose(db, alex, "instant")
    notify_invite_accepted(db, env.mailer, env.settings, space_row, alex.id, blake.id)
    env.mailer.drain()

    assert [message.to for message in mail.messages] == [alex.email]


@pytest.mark.parametrize("frequency", ["off", "daily"])
def test_updates_waiting_for_an_instant_email_are_dropped_when_the_person_switches_away(
    db: Session,
    env: Env,
    clock: FakeClock,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
    frequency: str,
) -> None:
    clock.current = at(19, 15)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Body")
    choose(db, blake, frequency)

    sent = instant(env, session_factory, mail)
    clock.current = at(20, 9)
    next_morning = summaries(env, session_factory, mail)

    assert [message.to for message in sent] == [carol.email]
    assert next_morning == []
