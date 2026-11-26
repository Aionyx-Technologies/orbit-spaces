from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

MEMORY_KEY_MAX = 100


def _drop_current_key_index() -> None:
    # SQLite rebuilds the table for a batch change and cannot carry an expression
    # index across, so it is dropped first and created again afterwards.
    op.drop_index("uq_memory_current_key", table_name="memory")


def _create_current_key_index() -> None:
    op.create_index(
        "uq_memory_current_key",
        "memory",
        ["space_id", sa.text('lower("key")')],
        unique=True,
        sqlite_where=sa.text("superseded_at IS NULL"),
        postgresql_where=sa.text("superseded_at IS NULL"),
    )


def _backfill() -> None:
    connection = op.get_bind()
    memory = sa.table(
        "memory",
        sa.column("id", sa.String),
        sa.column("space_id", sa.String),
        sa.column("key", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("fact_id", sa.String),
        sa.column("action", sa.String),
    )
    rows = connection.execute(
        sa.select(memory.c.id, memory.c.space_id, memory.c.key).order_by(
            memory.c.created_at, memory.c.id
        )
    ).all()
    fact_ids: dict[tuple[str, str], str] = {}
    for row_id, space_id, key in rows:
        group = (space_id, key.casefold())
        action = "edit" if group in fact_ids else "add"
        fact_id = fact_ids.setdefault(group, str(uuid.uuid4()))
        connection.execute(
            memory.update().where(memory.c.id == row_id).values(fact_id=fact_id, action=action)
        )


def upgrade() -> None:
    _drop_current_key_index()
    with op.batch_alter_table("memory", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fact_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("action", sa.String(length=16), nullable=True))
        batch_op.add_column(
            sa.Column("previous_key", sa.String(length=MEMORY_KEY_MAX), nullable=True)
        )
    _backfill()
    with op.batch_alter_table("memory", schema=None) as batch_op:
        batch_op.alter_column("fact_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.alter_column("action", existing_type=sa.String(length=16), nullable=False)
        batch_op.create_index("ix_memory_space_fact", ["space_id", "fact_id"], unique=False)
    _create_current_key_index()


def downgrade() -> None:
    _drop_current_key_index()
    with op.batch_alter_table("memory", schema=None) as batch_op:
        batch_op.drop_index("ix_memory_space_fact")
        batch_op.drop_column("previous_key")
        batch_op.drop_column("action")
        batch_op.drop_column("fact_id")
    _create_current_key_index()
