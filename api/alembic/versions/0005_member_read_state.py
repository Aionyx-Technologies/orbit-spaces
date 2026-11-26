from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("space_members", schema=None) as batch_op:
        batch_op.add_column(sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("space_members", schema=None) as batch_op:
        batch_op.drop_column("last_read_at")
