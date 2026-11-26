from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_use_ledger",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refunds_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ai_use_ledger_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["refunds_id"],
            ["ai_use_ledger.id"],
            name=op.f("fk_ai_use_ledger_refunds_id_ai_use_ledger"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_use_ledger")),
        sa.UniqueConstraint("refunds_id", name=op.f("uq_ai_use_ledger_refunds_id")),
    )
    op.create_index(
        "ix_ai_use_ledger_user_period", "ai_use_ledger", ["user_id", "period_start"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_ai_use_ledger_user_period", table_name="ai_use_ledger")
    op.drop_table("ai_use_ledger")
