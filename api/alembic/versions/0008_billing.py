from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "billing_accounts",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=64), nullable=False),
        sa.Column("plan", sa.String(length=16), server_default="free", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="", nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_billing_accounts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_billing_accounts")),
        sa.UniqueConstraint(
            "stripe_customer_id", name=op.f("uq_billing_accounts_stripe_customer_id")
        ),
    )
    op.create_table(
        "credit_grants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stripe_event_id", sa.String(length=64), nullable=False),
        sa.Column("stripe_payment_intent", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_credit_grants_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit_grants")),
        sa.UniqueConstraint("stripe_event_id", name=op.f("uq_credit_grants_stripe_event_id")),
    )
    op.create_index(op.f("ix_credit_grants_user_id"), "credit_grants", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_credit_grants_stripe_payment_intent"),
        "credit_grants",
        ["stripe_payment_intent"],
        unique=False,
    )
    op.create_table(
        "stripe_events",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stripe_events")),
    )
    op.create_table(
        "email_send_log",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("grant_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_email_send_log_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["grant_id"],
            ["credit_grants.id"],
            name=op.f("fk_email_send_log_grant_id_credit_grants"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_send_log")),
    )
    op.create_index(
        "ix_email_send_log_user_sent", "email_send_log", ["user_id", "sent_at"], unique=False
    )
    with op.batch_alter_table("ai_use_ledger") as batch:
        batch.add_column(sa.Column("grant_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key(
            op.f("fk_ai_use_ledger_grant_id_credit_grants"),
            "credit_grants",
            ["grant_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("ai_use_ledger") as batch:
        batch.drop_constraint(op.f("fk_ai_use_ledger_grant_id_credit_grants"), type_="foreignkey")
        batch.drop_column("grant_id")
    op.drop_index("ix_email_send_log_user_sent", table_name="email_send_log")
    op.drop_table("email_send_log")
    op.drop_table("stripe_events")
    op.drop_index(op.f("ix_credit_grants_stripe_payment_intent"), table_name="credit_grants")
    op.drop_index(op.f("ix_credit_grants_user_id"), table_name="credit_grants")
    op.drop_table("credit_grants")
    op.drop_table("billing_accounts")
