from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("about", sa.String(length=160), server_default="", nullable=False)
    )
    op.add_column(
        "users", sa.Column("time_zone", sa.String(length=64), server_default="UTC", nullable=False)
    )
    op.add_column(
        "users",
        sa.Column(
            "email_frequency", sa.String(length=10), server_default="instant", nullable=False
        ),
    )
    op.add_column("users", sa.Column("default_space_id", sa.String(length=36), nullable=True))
    op.add_column(
        "users", sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "web_sessions",
        sa.Column("user_agent", sa.String(length=40), server_default="", nullable=False),
    )
    op.create_table(
        "user_avatars",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_avatars_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_avatars")),
    )


def downgrade() -> None:
    op.drop_table("user_avatars")
    op.drop_column("web_sessions", "user_agent")
    op.drop_column("users", "avatar_updated_at")
    op.drop_column("users", "default_space_id")
    op.drop_column("users", "email_frequency")
    op.drop_column("users", "time_zone")
    op.drop_column("users", "about")
