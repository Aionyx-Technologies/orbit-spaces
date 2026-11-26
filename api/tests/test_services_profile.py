from __future__ import annotations

import asyncio
import io

import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.errors import InvalidInput, NotAMember, NotFound, RateLimited, SpaceNotFound, TooLong
from orbit.events import PROFILE_CHANGED
from orbit.limits import ABOUT_MAX, AVATAR_UPLOADS_PER_USER
from orbit.models import SpaceMember, User, UserAvatar
from orbit.services import accounts as accounts_service
from orbit.services import profile as profile_service
from orbit.services import spaces as spaces_service
from orbit.services.context import Env
from tests.conftest import Factory, FakeClock, Person
from tests.image_helpers import picture

pytestmark = pytest.mark.anyio

UPLOADS_PER_DAY = AVATAR_UPLOADS_PER_USER[0]


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


@pytest.fixture
def carol(make: Factory) -> Person:
    return make.user("carol@example.com", "Carol")


def load(db: Session, person: Person) -> User:
    user = db.get(User, person.id)
    assert user is not None
    return user


def avatar_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(UserAvatar)) or 0


def test_a_new_person_starts_with_the_defaults(db: Session, alex: Person) -> None:
    user = load(db, alex)

    assert user.about == ""
    assert user.time_zone == "UTC"
    assert user.email_frequency == "instant"
    assert user.default_space_id is None
    assert user.avatar_updated_at is None


def test_each_field_can_be_changed_on_its_own(db: Session, alex: Person, make: Factory) -> None:
    space = make.space(alex, "Goa trip")
    user = load(db, alex)

    profile_service.update_me(db, user, {"about": "Plans the trips"})
    profile_service.update_me(db, user, {"time_zone": "Asia/Kolkata"})
    profile_service.update_me(db, user, {"email_frequency": "daily"})
    profile_service.update_me(db, user, {"default_space_id": space.id})

    assert (user.about, user.time_zone, user.email_frequency, user.default_space_id) == (
        "Plans the trips",
        "Asia/Kolkata",
        "daily",
        space.id,
    )
    assert user.display_name == "Alex"


def test_the_name_rules_are_the_same_as_before(db: Session, alex: Person) -> None:
    user = load(db, alex)

    profile_service.update_me(db, user, {"display_name": "  Alex \n Smith "})
    with pytest.raises(InvalidInput) as blank:
        profile_service.update_me(db, user, {"display_name": "   "})
    with pytest.raises(TooLong):
        profile_service.update_me(db, user, {"display_name": "x" * 61})

    assert user.display_name == "Alex Smith"
    assert blank.value.message == "Name cannot be empty."


def test_about_me_is_plain_single_line_text_with_a_limit(db: Session, alex: Person) -> None:
    user = load(db, alex)

    profile_service.update_me(db, user, {"about": "  Loves   long\n walks \x00 "})
    tidied = user.about
    profile_service.update_me(db, user, {"about": "x" * ABOUT_MAX})
    longest = user.about
    with pytest.raises(TooLong) as raised:
        profile_service.update_me(db, user, {"about": "x" * (ABOUT_MAX + 1)})

    assert tidied == "Loves long walks"
    assert longest == "x" * ABOUT_MAX
    assert user.about == longest
    assert "160 characters" in raised.value.message


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_about_me_can_be_cleared(db: Session, alex: Person, blank: str | None) -> None:
    user = load(db, alex)
    profile_service.update_me(db, user, {"about": "Something"})

    profile_service.update_me(db, user, {"about": blank})

    assert user.about == ""


def test_about_me_is_kept_as_text_not_markup(db: Session, alex: Person) -> None:
    user = load(db, alex)

    profile_service.update_me(db, user, {"about": "<img src=x onerror=alert(1)> [link](http://x)"})

    assert user.about == "<img src=x onerror=alert(1)> [link](http://x)"


@pytest.mark.parametrize("zone", ["Asia/Kolkata", "America/New_York", "UTC", "Europe/Lisbon"])
def test_real_time_zones_are_accepted(db: Session, alex: Person, zone: str) -> None:
    user = load(db, alex)

    profile_service.update_me(db, user, {"time_zone": zone})

    assert user.time_zone == zone


@pytest.mark.parametrize("zone", ["Mars/Olympus", "", "   ", "../../etc/passwd", "x" * 80, None])
def test_an_unknown_time_zone_is_refused_with_a_plain_message(
    db: Session, alex: Person, zone: str | None
) -> None:
    user = load(db, alex)

    with pytest.raises(InvalidInput) as raised:
        profile_service.update_me(db, user, {"time_zone": zone})

    assert raised.value.message in {"Choose a time zone.", "That time zone is not one Orbit knows."}
    assert user.time_zone == "UTC"


@pytest.mark.parametrize("choice", ["instant", "daily", "off"])
def test_the_three_email_choices_are_accepted(db: Session, alex: Person, choice: str) -> None:
    user = load(db, alex)

    profile_service.update_me(db, user, {"email_frequency": choice})

    assert user.email_frequency == choice


@pytest.mark.parametrize("choice", ["weekly", "", "INSTANT", None])
def test_any_other_email_choice_is_refused(db: Session, alex: Person, choice: str | None) -> None:
    user = load(db, alex)

    with pytest.raises(InvalidInput):
        profile_service.update_me(db, user, {"email_frequency": choice})

    assert user.email_frequency == "instant"


def test_the_default_space_has_to_be_one_the_person_belongs_to(
    db: Session, alex: Person, blake: Person, make: Factory
) -> None:
    theirs = make.space(blake, "Blake only")
    user = load(db, alex)

    with pytest.raises(NotAMember):
        profile_service.update_me(db, user, {"default_space_id": theirs.id})
    with pytest.raises(SpaceNotFound):
        profile_service.update_me(
            db, user, {"default_space_id": "00000000-0000-0000-0000-000000000000"}
        )

    assert user.default_space_id is None


@pytest.mark.parametrize("cleared", [None, "", "  "])
def test_the_default_space_can_be_cleared(
    db: Session, alex: Person, make: Factory, cleared: str | None
) -> None:
    space = make.space(alex)
    user = load(db, alex)
    profile_service.update_me(db, user, {"default_space_id": space.id})

    profile_service.update_me(db, user, {"default_space_id": cleared})

    assert user.default_space_id is None


def test_a_refused_change_changes_nothing_at_all(db: Session, alex: Person) -> None:
    user = load(db, alex)

    with pytest.raises(InvalidInput):
        profile_service.update_me(
            db,
            user,
            {"about": "A new line", "display_name": "Renamed", "email_frequency": "weekly"},
        )
    db.refresh(user)

    assert user.about == ""
    assert user.display_name == "Alex"


def test_a_photo_is_stored_as_a_small_square_and_the_person_is_marked(
    db: Session, env: Env, alex: Person
) -> None:
    user = load(db, alex)

    profile_service.set_avatar(db, env, user, picture(size=(640, 480)))

    stored = db.get(UserAvatar, alex.id)
    assert stored is not None
    image = Image.open(io.BytesIO(stored.data))
    assert (image.format, image.size) == ("WEBP", (256, 256))
    assert user.avatar_updated_at == stored.updated_at
    assert profile_service.avatar_url(alex.id, user.avatar_updated_at) == (
        f"/api/users/{alex.id}/avatar?v={int(stored.updated_at.timestamp())}"
    )


def test_the_address_of_a_photo_changes_when_the_photo_does(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    user = load(db, alex)
    profile_service.set_avatar(db, env, user, picture())
    first = profile_service.avatar_url(alex.id, user.avatar_updated_at)
    clock.advance(seconds=30)

    profile_service.set_avatar(db, env, user, picture((200, 40, 40)))

    assert profile_service.avatar_url(alex.id, user.avatar_updated_at) != first
    assert avatar_count(db) == 1


def test_a_person_without_a_photo_has_no_address(db: Session, alex: Person) -> None:
    assert profile_service.avatar_url(alex.id, load(db, alex).avatar_updated_at) is None


def test_a_refused_file_keeps_the_photo_the_person_already_had(
    db: Session, env: Env, alex: Person
) -> None:
    user = load(db, alex)
    profile_service.set_avatar(db, env, user, picture())
    before = db.get(UserAvatar, alex.id)
    assert before is not None
    kept = (before.data, user.avatar_updated_at)

    with pytest.raises(InvalidInput):
        profile_service.set_avatar(db, env, user, b"this is not a picture")
    db.refresh(user)
    after = db.get(UserAvatar, alex.id)

    assert after is not None
    assert (after.data, user.avatar_updated_at) == kept


def test_removing_the_photo_deletes_it_and_returns_to_the_initial(
    db: Session, env: Env, alex: Person
) -> None:
    user = load(db, alex)
    profile_service.set_avatar(db, env, user, picture())

    profile_service.remove_avatar(db, env, user)
    profile_service.remove_avatar(db, env, user)

    assert avatar_count(db) == 0
    assert user.avatar_updated_at is None


def test_ten_photo_changes_a_day_then_it_waits_until_tomorrow(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    user = load(db, alex)
    photo = picture()
    for _ in range(UPLOADS_PER_DAY):
        profile_service.set_avatar(db, env, user, photo)

    with pytest.raises(RateLimited) as raised:
        profile_service.set_avatar(db, env, user, photo)

    assert "as often as allowed today" in raised.value.message
    clock.advance(hours=25)
    profile_service.set_avatar(db, env, user, photo)


def test_attempts_that_fail_still_count_towards_the_daily_limit(
    db: Session, env: Env, alex: Person
) -> None:
    user = load(db, alex)
    photo = picture()
    for _ in range(UPLOADS_PER_DAY):
        with pytest.raises(InvalidInput):
            profile_service.set_avatar(db, env, user, b"nope")

    with pytest.raises(RateLimited):
        profile_service.set_avatar(db, env, user, photo)


def test_the_limit_is_per_person(db: Session, env: Env, alex: Person, blake: Person) -> None:
    for _ in range(UPLOADS_PER_DAY):
        profile_service.set_avatar(db, env, load(db, alex), picture())

    profile_service.set_avatar(db, env, load(db, blake), picture())


def test_a_person_and_the_people_they_share_a_space_with_can_see_the_photo(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    make.space(alex, "Goa trip", blake)
    profile_service.set_avatar(db, env, load(db, alex), picture())

    own = profile_service.read_avatar(db, alex.id, alex.id)
    shared = profile_service.read_avatar(db, blake.id, alex.id)

    assert own.data == shared.data
    assert Image.open(io.BytesIO(own.data)).format == "WEBP"


def test_a_person_who_shares_no_space_cannot_see_the_photo(
    db: Session, env: Env, alex: Person, carol: Person, make: Factory
) -> None:
    make.space(alex, "Private")
    profile_service.set_avatar(db, env, load(db, alex), picture())

    with pytest.raises(NotFound) as raised:
        profile_service.read_avatar(db, carol.id, alex.id)

    assert raised.value.message == "Photo not found."


def test_asking_for_a_photo_nobody_set_looks_the_same_as_being_refused(
    db: Session, alex: Person, blake: Person, make: Factory
) -> None:
    make.space(alex, "Goa trip", blake)

    with pytest.raises(NotFound) as nobody_set:
        profile_service.read_avatar(db, blake.id, alex.id)
    with pytest.raises(NotFound) as unknown:
        profile_service.read_avatar(db, blake.id, "00000000-0000-0000-0000-000000000000")

    assert nobody_set.value.message == unknown.value.message


def test_leaving_the_only_shared_space_ends_access_to_the_photo(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    space = make.space(alex, "Goa trip", blake)
    profile_service.set_avatar(db, env, load(db, alex), picture())
    assert profile_service.read_avatar(db, blake.id, alex.id)

    membership = db.get(SpaceMember, (space.id, blake.id))
    assert membership is not None
    db.delete(membership)
    db.commit()

    with pytest.raises(NotFound):
        profile_service.read_avatar(db, blake.id, alex.id)


def test_a_deleted_space_no_longer_counts_as_shared(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    space = make.space(alex, "Goa trip", blake)
    profile_service.set_avatar(db, env, load(db, alex), picture())

    spaces_service.delete_space(db, env, alex.web(), space.id)

    with pytest.raises(NotFound):
        profile_service.read_avatar(db, blake.id, alex.id)


def test_one_shared_space_is_enough_when_there_are_several(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    make.space(alex, "Alone")
    make.space(blake, "Also alone")
    make.space(alex, "Together", blake)
    profile_service.set_avatar(db, env, load(db, alex), picture())

    assert profile_service.read_avatar(db, blake.id, alex.id)


async def test_a_photo_change_is_announced_in_every_space_the_person_is_in(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    first = make.space(alex, "First", blake)
    second = make.space(alex, "Second")
    elsewhere = make.space(blake, "Not alex")
    subscriptions = {
        space.id: env.events.subscribe(space.id) for space in (first, second, elsewhere)
    }

    await asyncio.to_thread(profile_service.set_avatar, db, env, load(db, alex), picture())

    for space in (first, second):
        event = await asyncio.wait_for(subscriptions[space.id].queue.get(), 2)
        assert (event.type, event.data) == (PROFILE_CHANGED, {"user_id": alex.id})
    assert subscriptions[elsewhere.id].queue.empty()


def test_deleting_the_account_deletes_the_photo(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    make.space(alex, "Goa trip", blake)
    profile_service.set_avatar(db, env, load(db, alex), picture())
    profile_service.set_avatar(db, env, load(db, blake), picture())

    accounts_service.delete_account(db, env, load(db, alex))

    remaining = db.scalars(select(UserAvatar.user_id)).all()
    assert list(remaining) == [blake.id]
