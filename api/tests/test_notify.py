from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from orbit.db import SessionFactory
from orbit.email import EmailMessage
from orbit.errors import InviteUnusable
from orbit.models import Space, User
from orbit.runtime import Runtime
from orbit.services import accounts as accounts_service
from orbit.services import invites as invites_service
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import spaces as spaces_service
from orbit.services.context import VIA_ORBIT_SUGGESTION, Env
from orbit.services.notify import (
    KIND_FACT,
    MAX_LINES,
    Activity,
    describe,
    notify_invite_accepted,
)
from orbit.services.views import SpaceView
from tests.conftest import BASE_URL, Factory, FakeClock, Person, RecordingSender
from tests.rest_helpers import People, create_space, join, share


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


def deliver(
    env: Env, session_factory: SessionFactory, mail: RecordingSender, force: bool = False
) -> list[EmailMessage]:
    before = len(mail.messages)
    env.notifier.flush_due(session_factory, force)
    env.mailer.drain()
    return mail.messages[before:]


def test_a_share_emails_everyone_except_the_person_who_shared(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(
        db, env, blake.via("Grok"), space.id, "Hotel shortlist", "Secret body text"
    )

    sent = deliver(env, session_factory, mail)

    assert sorted(message.to for message in sent) == [alex.email, carol.email]
    message = sent[0]
    assert message.subject == 'Blake shared "Hotel shortlist" in Goa trip'
    assert 'Blake shared "Hotel shortlist" via Grok' in message.text
    assert f"https://orbit.test/spaces/{space.id}" in message.text
    assert "https://orbit.test/settings" in message.text
    assert message.html is not None
    assert f"https://orbit.test/spaces/{space.id}" in message.html


def test_emails_carry_titles_and_names_but_never_content(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    blake: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "Plain title", "Very private body")
    memory_service.set_fact(db, env, blake.web(), space.id, "Budget", "A private figure")

    sent = deliver(env, session_factory, mail)

    for message in sent:
        everything = message.text + (message.html or "")
        assert "Very private body" not in everything
        assert "A private figure" not in everything
        assert "Plain title" in everything
        assert "Budget" in everything


def test_via_phrase_for_orbit_suggestion() -> None:
    at = datetime(2026, 1, 1, tzinfo=UTC)

    text = describe(Activity(KIND_FACT, "Alex", VIA_ORBIT_SUGGESTION, "Budget", at))

    assert text == 'Alex updated the fact "Budget", suggested by Orbit'


def test_web_shares_are_described_as_on_the_web(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    blake: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "From the page", "Body")

    [first, _second] = deliver(env, session_factory, mail)

    assert 'Blake shared "From the page" on the web' in first.text


def test_markup_in_names_and_titles_is_escaped_in_the_html_email(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
) -> None:
    sneaky = make.user("sneaky@example.com", "<b>Sneaky</b>")
    space = make.space(alex, "Plain", sneaky)
    items_service.share_item(db, env, sneaky.web(), space.id, "<script>alert(1)</script>", "x")

    [message] = deliver(env, session_factory, mail)

    assert message.html is not None
    assert "<script>" not in message.html
    assert "&lt;script&gt;" in message.html
    assert "<b>Sneaky</b>" not in message.html


def test_people_who_switched_notifications_off_get_nothing(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
) -> None:
    spaces_service.set_notify(db, carol.id, space.id, False)

    items_service.share_item(db, env, blake.web(), space.id, "Update", "Body")
    sent = deliver(env, session_factory, mail)

    assert [message.to for message in sent] == [alex.email]


def test_switching_off_after_an_update_but_before_the_email_still_stops_it(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "Update", "Body")
    spaces_service.set_notify(db, alex.id, space.id, False)

    sent = deliver(env, session_factory, mail)

    assert [message.to for message in sent] == [carol.email]


def test_a_burst_of_changes_becomes_one_email_listing_them_all(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.via("Grok"), space.id, "One", "x")
    items_service.share_item(db, env, blake.via("Grok"), space.id, "Two", "x")
    memory_service.set_fact(db, env, blake.via("Grok"), space.id, "Dates", "Dec 20")

    sent = [message for message in deliver(env, session_factory, mail) if message.to == alex.email]

    assert len(sent) == 1
    assert sent[0].subject == "3 updates in Goa trip"
    assert sent[0].text.count("\n- ") == 3
    assert 'Blake shared "One" via Grok' in sent[0].text
    assert 'Blake shared "Two" via Grok' in sent[0].text
    assert 'Blake updated the fact "Dates" via Grok' in sent[0].text


def test_at_most_one_email_every_five_minutes_per_person_per_space(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    clock: FakeClock,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "First", "x")
    first = deliver(env, session_factory, mail)

    items_service.share_item(db, env, blake.web(), space.id, "Second", "x")
    clock.advance(minutes=2)
    too_soon = deliver(env, session_factory, mail)
    clock.advance(minutes=3)
    later = deliver(env, session_factory, mail)

    assert len([m for m in first if m.to == alex.email]) == 1
    assert too_soon == []
    [for_alex] = [m for m in later if m.to == alex.email]
    assert "Second" in for_alex.text
    assert "First" not in for_alex.text
    assert env.notifier.pending_count == 0


def test_the_window_is_per_space(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
) -> None:
    one = make.space(alex, "One", blake)
    two = make.space(alex, "Two", blake)
    items_service.share_item(db, env, blake.web(), one.id, "In one", "x")
    items_service.share_item(db, env, blake.web(), two.id, "In two", "x")

    sent = deliver(env, session_factory, mail)

    assert sorted(message.subject for message in sent) == [
        'Blake shared "In one" in One',
        'Blake shared "In two" in Two',
    ]


def test_an_idle_period_resets_the_window(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    clock: FakeClock,
    blake: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "Early", "x")
    deliver(env, session_factory, mail)
    clock.advance(hours=1)
    items_service.share_item(db, env, blake.web(), space.id, "Much later", "x")

    sent = deliver(env, session_factory, mail)

    assert len(sent) == 2


def test_an_unchanged_fact_and_a_retraction_send_nothing(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    blake: Person,
    space: SpaceView,
) -> None:
    memory_service.set_fact(db, env, blake.web(), space.id, "Budget", "$3,000")
    item = items_service.share_item(db, env, blake.web(), space.id, "Oops", "x")
    deliver(env, session_factory, mail)
    memory_service.set_fact(db, env, blake.web(), space.id, "Budget", "$3,000")
    items_service.retract_item(db, env, blake.web(), item.id)

    sent = deliver(env, session_factory, mail, force=True)

    assert sent == []
    assert env.notifier.pending_count == 0


def test_a_forced_flush_ignores_the_window(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    blake: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "One", "x")
    deliver(env, session_factory, mail)
    items_service.share_item(db, env, blake.web(), space.id, "Two", "x")

    assert deliver(env, session_factory, mail) == []
    assert len(deliver(env, session_factory, mail, force=True)) == 2


def test_long_digests_are_cut_with_a_count_of_the_rest(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    for number in range(MAX_LINES + 5):
        items_service.share_item(db, env, blake.web(), space.id, f"Item {number}", "x")

    sent = [m for m in deliver(env, session_factory, mail) if m.to == alex.email]

    assert sent[0].subject == f"{MAX_LINES + 5} updates in Goa trip"
    assert sent[0].text.count("\n- ") == MAX_LINES + 1
    assert "- and 5 more" in sent[0].text


def test_updates_for_a_deleted_space_or_person_are_dropped_quietly(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    mail: RecordingSender,
    alex: Person,
    blake: Person,
    carol: Person,
    space: SpaceView,
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "Soon gone", "x")
    carol_row = db.get(User, carol.id)
    assert carol_row is not None
    accounts_service.delete_account(db, env, carol_row)

    sent = deliver(env, session_factory, mail)
    assert [message.to for message in sent] == [alex.email]

    items_service.share_item(db, env, blake.web(), space.id, "Also gone", "x")
    spaces_service.delete_space(db, env, alex.web(), space.id)
    assert deliver(env, session_factory, mail, force=True) == []


def test_the_inviter_hears_straight_away_when_someone_accepts(
    db: Session,
    env: Env,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
) -> None:
    space = make.space(alex, "Goa trip")
    invite = invites_service.create_invite(db, env, alex.web(), space.id, None)
    token = invite.url.rsplit("/", 1)[-1]

    invites_service.accept_invite(db, env, blake.id, token)
    env.mailer.drain()

    [message] = mail.messages
    assert message.to == alex.email
    assert message.subject == "Blake joined Goa trip on Orbit"
    assert 'Blake joined "Goa trip" on Orbit.' in message.text
    assert f"https://orbit.test/spaces/{space.id}" in message.text
    assert message.html is not None


def test_an_inviter_who_opted_out_of_the_space_is_not_emailed(
    db: Session,
    env: Env,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
) -> None:
    space = make.space(alex, "Goa trip")
    spaces_service.set_notify(db, alex.id, space.id, False)
    invite = invites_service.create_invite(db, env, alex.web(), space.id, None)

    invites_service.accept_invite(db, env, blake.id, invite.url.rsplit("/", 1)[-1])
    env.mailer.drain()

    assert mail.messages == []


@pytest.mark.parametrize("inviter", ["nobody", "unknown", "self"])
def test_the_invite_accepted_email_is_skipped_when_there_is_no_one_to_tell(
    db: Session,
    env: Env,
    mail: RecordingSender,
    make: Factory,
    alex: Person,
    blake: Person,
    inviter: str,
) -> None:
    space = make.space(alex, "Goa trip", blake)
    row = db.get(Space, space.id)
    assert row is not None
    inviter_id = {"nobody": None, "unknown": "no-such-user", "self": blake.id}[inviter]

    notify_invite_accepted(db, env.mailer, env.settings, row, inviter_id, blake.id)
    env.mailer.drain()

    assert mail.messages == []


def test_removing_the_inviter_revokes_what_they_sent_so_it_cannot_be_accepted_later(
    db: Session,
    env: Env,
    make: Factory,
    alex: Person,
    blake: Person,
    carol: Person,
) -> None:
    space = make.space(carol, "Shared", alex)
    invite = invites_service.create_invite(db, env, carol.web(), space.id, None)
    carol_row = db.get(User, carol.id)
    assert carol_row is not None
    accounts_service.delete_account(db, env, carol_row)
    token = invite.url.rsplit("/", 1)[-1]

    with pytest.raises(InviteUnusable):
        invites_service.accept_invite(db, env, blake.id, token)


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def test_with_every_tab_closed_the_other_person_still_hears_about_a_change(
    people: People, runtime: Runtime, sender: RecordingSender
) -> None:
    space = create_space(people.as_("alex@example.com"), "Goa trip")
    join(people, "alex@example.com", "blake@example.com", space["id"])
    runtime.env.mailer.drain()
    sender.messages.clear()

    share(people.as_("blake@example.com"), space["id"], "Morning flight", "Leaves at 7:10")
    runtime.env.notifier.flush_due(runtime.session_factory)
    runtime.env.mailer.drain()

    [message] = sender.to("alex@example.com")
    assert message.subject == 'Blake shared "Morning flight" in Goa trip'
    assert sender.to("blake@example.com") == []


def test_pending_updates_are_sent_when_the_app_shuts_down(
    app: FastAPI, runtime: Runtime, sender: RecordingSender
) -> None:
    with TestClient(
        app, base_url=BASE_URL, follow_redirects=False, headers={"Origin": BASE_URL}
    ) as live:
        crowd = People(live, runtime, sender)
        space = create_space(crowd.as_("alex@example.com"), "Goa trip")
        join(crowd, "alex@example.com", "blake@example.com", space["id"])
        runtime.env.mailer.drain()
        sender.messages.clear()
        share(crowd.as_("blake@example.com"), space["id"], "Last words", "x")
        assert sender.to("alex@example.com") == []

    [message] = sender.to("alex@example.com")
    assert 'Blake shared "Last words"' in message.text
