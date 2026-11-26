from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("magic_links", schema=None) as batch_op:
        batch_op.add_column(sa.Column("code_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column("code_attempts", sa.Integer(), server_default="0", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("magic_links", schema=None) as batch_op:
        batch_op.drop_column("code_attempts")
        batch_op.drop_column("code_hash")
