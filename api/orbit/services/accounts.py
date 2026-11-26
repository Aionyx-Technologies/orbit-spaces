from __future__ import annotations

import logging

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from orbit.billing import BillingTransientError
from orbit.errors import BillingUnavailable
from orbit.limits import DISPLAY_NAME_MAX
from orbit.models import (
    BillingAccount,
    Invite,
    Item,
    MagicLink,
    Memory,
    Space,
    SpaceMember,
    User,
    Waitlist,
)
from orbit.services.context import Env
from orbit.services.spaces import purge_space
from orbit.text import clean_single_line

log = logging.getLogger(__name__)


def update_profile(db: Session, user: User, display_name: str) -> User:
    user.display_name = clean_single_line(display_name, "Name", DISPLAY_NAME_MAX)
    db.commit()
    return user


def _hand_over_or_purge_created_spaces(db: Session, env: Env, user_id: str) -> None:
    created = db.scalars(
        select(Space).where(Space.created_by == user_id, Space.deleted_at.is_(None))
    ).all()
    for space in created:
        successor = db.scalar(
            select(SpaceMember.user_id)
            .where(SpaceMember.space_id == space.id, SpaceMember.user_id != user_id)
            .order_by(SpaceMember.joined_at, SpaceMember.user_id)
            .limit(1)
        )
        if successor is None:
            purge_space(db, space, env.now())
        else:
            space.created_by = successor


def delete_account(db: Session, env: Env, user: User) -> None:
    user_id = user.id
    email = user.email
    now = env.now()
    customer_id = db.scalar(
        select(BillingAccount.stripe_customer_id).where(BillingAccount.user_id == user_id)
    )
    if env.billing is not None and customer_id is not None:
        # Release the database lock first: Stripe can be slow and must not hold a transaction.
        db.rollback()
        try:
            env.billing.cancel_customer(customer_id)
        except BillingTransientError:
            # Deleting now would drop the only link to a subscription that keeps charging, so
            # nothing is deleted and the person can try again. No transaction is open here.
            log.warning("Stripe was unreachable while deleting an account; nothing was deleted")
            raise BillingUnavailable(
                "Orbit could not reach Stripe to cancel your subscription. "
                "Try again in a few minutes."
            ) from None
        except Exception as error:
            # Not something waiting fixes (a bad key, a refused request): go ahead, so a
            # misconfigured server can never make deleting an account impossible.
            log.warning(
                "Could not cancel a Stripe customer while deleting an account (%s)",
                type(error).__name__,
            )
    _hand_over_or_purge_created_spaces(db, env, user_id)
    db.flush()
    db.execute(
        update(Item)
        .where(Item.shared_by == user_id, Item.retracted_at.is_(None))
        .values(retracted_at=now, title="", content="")
    )
    db.execute(update(Memory).where(Memory.set_by == user_id).values(set_by=None))
    db.execute(
        update(Invite)
        .where(
            Invite.invited_by == user_id,
            Invite.accepted_at.is_(None),
            Invite.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    db.execute(
        update(Invite)
        .where(
            Invite.email == email,
            Invite.accepted_at.is_(None),
            Invite.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    db.execute(update(Invite).where(Invite.email == email).values(email=None))
    db.execute(
        update(Invite)
        .where(Invite.invited_by == user_id, Invite.accepted_at.is_(None))
        .values(email=None)
    )
    db.execute(delete(MagicLink).where(MagicLink.email == email))
    db.execute(delete(Waitlist).where(Waitlist.email == email))
    db.execute(delete(User).where(User.id == user_id))
    db.commit()
