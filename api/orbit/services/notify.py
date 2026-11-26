from __future__ import annotations

import logging
import threading
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.db import SessionFactory, session_scope
from orbit.email import EmailMessage, Mailer
from orbit.limits import DAILY_SUMMARY_HOUR, EMAIL_BATCH_WINDOW
from orbit.mail_templates import (
    activity_message,
    daily_summary_message,
    invite_accepted_message,
)
from orbit.models import Space, SpaceMember, User
from orbit.services import email_allowance

logger = logging.getLogger("orbit.notify")

FREQUENCY_INSTANT = "instant"
FREQUENCY_DAILY = "daily"
FREQUENCY_OFF = "off"
KIND_ITEM = "item"
KIND_FACT = "fact"
KIND_PLAN = "plan"
MAX_LINES = 20
VIA_WEB = "web"
# Same value as context.VIA_ORBIT_SUGGESTION; context imports this module (circular).
VIA_ORBIT_SUGGESTION = "orbit-suggestion"


@dataclass(frozen=True)
class Activity:
    kind: str
    actor_name: str
    via: str
    label: str
    at: datetime


def _via_phrase(via: str) -> str:
    if not via:
        return ""
    if via == VIA_ORBIT_SUGGESTION:
        return ", suggested by Orbit"
    return " on the web" if via == VIA_WEB else f" via {via}"


def plan_activity(requester: str, via: str, at: datetime) -> Activity:
    return Activity(KIND_PLAN, "Orbit", via, f", requested by {requester}{_via_phrase(via)}", at)


def describe(activity: Activity) -> str:
    if activity.kind == KIND_ITEM:
        return f'{activity.actor_name} shared "{activity.label}"{_via_phrase(activity.via)}'
    if activity.kind == KIND_FACT:
        return (
            f'{activity.actor_name} updated the fact "{activity.label}"{_via_phrase(activity.via)}'
        )
    return f"Orbit combined a new plan{activity.label}"


def subject_for(activities: list[Activity], space_name: str) -> str:
    only = activities[0]
    if len(activities) == 1 and only.kind == KIND_ITEM:
        return f'{only.actor_name} shared "{only.label}" in {space_name}'
    noun = "update" if len(activities) == 1 else "updates"
    return f"{len(activities)} {noun} in {space_name}"


class Notifier:
    def __init__(
        self,
        settings: Settings,
        mailer: Mailer,
        clock: Callable[[], datetime],
        window: timedelta = EMAIL_BATCH_WINDOW,
    ) -> None:
        self._settings = settings
        self._mailer = mailer
        self._clock = clock
        self._window = window
        self._pending: dict[tuple[str, str], list[Activity]] = defaultdict(list)
        self._last_sent: dict[tuple[str, str], datetime] = {}
        self._daily: dict[str, list[tuple[str, Activity]]] = defaultdict(list)
        self._overflow: dict[str, list[tuple[str, Activity]]] = defaultdict(list)
        self._lock = threading.Lock()

    @property
    def pending_count(self) -> int:
        with self._lock:
            instant = sum(len(items) for items in self._pending.values())
            daily = sum(len(items) for items in self._daily.values())
            overflow = sum(len(items) for items in self._overflow.values())
            return instant + daily + overflow

    def record(self, db: Session, space_id: str, actor_id: str | None, activity: Activity) -> None:
        try:
            statement = (
                select(SpaceMember.user_id, User.email_frequency)
                .join(User, User.id == SpaceMember.user_id)
                .where(SpaceMember.space_id == space_id, SpaceMember.notify_email.is_(True))
            )
            recipients = [
                (uid, frequency) for uid, frequency in db.execute(statement) if uid != actor_id
            ]
        except Exception:
            logger.warning("Could not work out who to notify.")
            return
        with self._lock:
            for user_id, frequency in recipients:
                if frequency == FREQUENCY_OFF:
                    continue
                if frequency == FREQUENCY_DAILY:
                    self._daily[user_id].append((space_id, activity))
                    continue
                self._pending[(user_id, space_id)].append(activity)

    def _is_due(self, key: tuple[str, str], now: datetime) -> bool:
        last = self._last_sent.get(key)
        return last is None or now - last >= self._window

    def flush_due(
        self,
        session_factory: SessionFactory,
        force: bool = False,
        ignore_allowance: bool = False,
    ) -> int:
        now = self._clock()
        with self._lock:
            due = [
                key
                for key, items in self._pending.items()
                if items and (force or self._is_due(key, now))
            ]
            batches = {key: self._pending.pop(key) for key in due}
            for key in due:
                self._last_sent[key] = now
            stale = [
                key
                for key, sent_at in self._last_sent.items()
                if key not in self._pending and now - sent_at >= self._window
            ]
            for key in stale:
                del self._last_sent[key]
        sent = 0
        for (user_id, space_id), activities in batches.items():
            try:
                message = self._build(session_factory, user_id, space_id, activities)
                if message is None:
                    continue
                allowed = ignore_allowance or self._take_an_instant_email(session_factory, user_id)
            except Exception as error:
                # One person's database trouble must not lose anyone's updates: theirs wait
                # for the morning summary and the other batches go on.
                logger.warning(
                    "Could not send an update email (%s); it waits for the summary.",
                    type(error).__name__,
                )
                self._hold(user_id, space_id, activities, now)
                continue
            if not allowed:
                self._hold(user_id, space_id, activities, now)
                continue
            try:
                last_cap = (
                    0 if ignore_allowance else self._last_allowance_cap(session_factory, user_id)
                )
                if last_cap:
                    message = (
                        self._build(session_factory, user_id, space_id, activities, last_cap)
                        or message
                    )
            except Exception as error:
                # The email is already paid for: send it without the limit note.
                logger.warning("Could not add the daily limit note (%s).", type(error).__name__)
            self._mailer.enqueue(message)
            sent += 1
        return sent

    def _hold(self, user_id: str, space_id: str, activities: list[Activity], now: datetime) -> None:
        # Stamped with the time it was held, so one held just after this morning's summary
        # waits for tomorrow's instead of triggering a second summary.
        held = [(space_id, replace(item, at=now)) for item in activities]
        with self._lock:
            self._overflow[user_id].extend(held)

    def _take_an_instant_email(self, session_factory: SessionFactory, user_id: str) -> bool:
        if not self._settings.max_update_emails_per_day:
            return True
        with session_scope(session_factory) as db:
            allowed = email_allowance.try_send(db, self._settings, user_id, self._clock())
            db.commit()
            return allowed

    def _last_allowance_cap(self, session_factory: SessionFactory, user_id: str) -> int:
        if not self._settings.max_update_emails_per_day:
            return 0
        with session_scope(session_factory) as db:
            cap = email_allowance.last_allowance_cap(db, self._settings, user_id, self._clock())
            db.rollback()
            return cap

    def _build(
        self,
        session_factory: SessionFactory,
        user_id: str,
        space_id: str,
        activities: list[Activity],
        limit_note: int = 0,
    ) -> EmailMessage | None:
        with session_scope(session_factory) as db:
            user = db.get(User, user_id)
            space = db.get(Space, space_id)
            membership = db.get(SpaceMember, (space_id, user_id))
            if (
                user is None
                or space is None
                or space.deleted_at is not None
                or membership is None
                or not membership.notify_email
                or user.email_frequency != FREQUENCY_INSTANT
            ):
                return None
            email, space_name = user.email, space.name
        shown = activities[:MAX_LINES]
        base = self._settings.base_url
        return activity_message(
            to=email,
            subject=subject_for(activities, space_name),
            space=space_name,
            lines=[describe(activity) for activity in shown],
            more=len(activities) - len(shown),
            link=f"{base}/spaces/{space_id}",
            settings_link=f"{base}/settings",
            limit_note=limit_note,
        )

    def flush_daily(self, session_factory: SessionFactory) -> int:
        now = self._clock()
        with self._lock:
            waiting = list({*self._daily, *self._overflow})
        if not waiting:
            return 0
        with session_scope(session_factory) as db:
            people = {
                row[0]: (row[1], row[2], row[3])
                for row in db.execute(
                    select(User.id, User.email, User.time_zone, User.email_frequency).where(
                        User.id.in_(waiting)
                    )
                )
            }
        sent = 0
        for user_id in waiting:
            person = people.get(user_id)
            if person is None or person[2] == FREQUENCY_OFF:
                with self._lock:
                    self._daily.pop(user_id, None)
                    self._overflow.pop(user_id, None)
                continue
            email, time_zone, frequency = person
            cutoff = _todays_summary_time(time_zone, now)
            if cutoff is None:
                continue
            keeps_daily = frequency == FREQUENCY_DAILY
            with self._lock:
                held = self._overflow.pop(user_id, [])
                held_ids = {id(entry) for entry in held}
                waiting_daily = self._daily.pop(user_id, [])
                if keeps_daily:
                    held = waiting_daily + held
                due = sorted(
                    (entry for entry in held if entry[1].at < cutoff), key=lambda e: e[1].at
                )
                later = [entry for entry in held if entry[1].at >= cutoff]
                held_back = any(id(entry) in held_ids for entry in due)
                if later:
                    (self._daily if keeps_daily else self._overflow)[user_id] = later
            if not due:
                continue
            message = self._build_daily(
                session_factory, user_id, email, time_zone, cutoff, due, held_back
            )
            if message is not None:
                self._mailer.enqueue(message)
                sent += 1
        return sent

    def _build_daily(
        self,
        session_factory: SessionFactory,
        user_id: str,
        email: str,
        time_zone: str,
        cutoff: datetime,
        due: list[tuple[str, Activity]],
        held_back: bool,
    ) -> EmailMessage | None:
        by_space: dict[str, list[Activity]] = {}
        for space_id, activity in due:
            by_space.setdefault(space_id, []).append(activity)
        base = self._settings.base_url
        sections: list[dict[str, object]] = []
        total = 0
        with session_scope(session_factory) as db:
            for space_id, activities in by_space.items():
                space = db.get(Space, space_id)
                membership = db.get(SpaceMember, (space_id, user_id))
                if (
                    space is None
                    or space.deleted_at is not None
                    or membership is None
                    or not membership.notify_email
                ):
                    continue
                shown = activities[:MAX_LINES]
                total += len(activities)
                sections.append(
                    {
                        "space": space.name,
                        "lines": [describe(activity) for activity in shown],
                        "more": len(activities) - len(shown),
                        "link": f"{base}/spaces/{space_id}",
                    }
                )
        if not sections:
            return None
        noun = "update" if total == 1 else "updates"
        spaces = "space" if len(sections) == 1 else "spaces"
        local = cutoff.astimezone(_zone_or_utc(time_zone))
        weekday = local.strftime("%A")
        month = local.strftime("%B")
        return daily_summary_message(
            to=email,
            subject=f"Your Orbit summary: {total} {noun} in {len(sections)} {spaces}",
            date=f"{weekday} {local.day} {month}",
            sections=sections,
            settings_link=f"{base}/settings",
            held_back_limit=self._settings.max_update_emails_per_day if held_back else 0,
        )


def _zone_or_utc(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return ZoneInfo("UTC")


def _todays_summary_time(time_zone: str, now: datetime) -> datetime | None:
    local = now.astimezone(_zone_or_utc(time_zone))
    morning = local.replace(hour=DAILY_SUMMARY_HOUR, minute=0, second=0, microsecond=0)
    if local < morning:
        return None
    return morning.astimezone(UTC)


def notify_invite_accepted(
    db: Session,
    mailer: Mailer,
    settings: Settings,
    space: Space,
    inviter_id: str | None,
    joiner_id: str,
) -> None:
    if inviter_id is None or inviter_id == joiner_id:
        return
    try:
        inviter = db.get(User, inviter_id)
        joiner = db.get(User, joiner_id)
        membership = db.get(SpaceMember, (space.id, inviter_id))
        if (
            inviter is None
            or joiner is None
            or membership is None
            or not membership.notify_email
            or inviter.email_frequency == FREQUENCY_OFF
        ):
            return
        base = settings.base_url
        mailer.enqueue(
            invite_accepted_message(
                to=inviter.email,
                joiner=joiner.display_name,
                space=space.name,
                link=f"{base}/spaces/{space.id}",
                settings_link=f"{base}/settings",
            )
        )
    except Exception:
        logger.warning("Could not send the invite-accepted email.")
