from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("billing_accounts") as batch:
        batch.add_column(sa.Column("stripe_subscription_id", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("billing_accounts") as batch:
        batch.drop_column("last_event_at")
        batch.drop_column("stripe_subscription_id")
