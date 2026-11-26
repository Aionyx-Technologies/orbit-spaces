from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "magic_links",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_magic_links")),
    )
    with op.batch_alter_table("magic_links", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_magic_links_email"), ["email"], unique=False)

    op.create_table(
        "oauth_clients",
        sa.Column("client_id", sa.String(length=512), nullable=False),
        sa.Column("client_name", sa.String(length=200), nullable=False),
        sa.Column("redirect_uris", sa.JSON(), nullable=False),
        sa.Column("registration_type", sa.String(length=10), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "registration_type in ('cimd', 'dcr')", name=op.f("ck_oauth_clients_registration_type")
        ),
        sa.PrimaryKeyConstraint("client_id", name=op.f("pk_oauth_clients")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=60), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "waitlist",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("email", name=op.f("pk_waitlist")),
    )
    op.create_table(
        "oauth_codes",
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=512), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("redirect_uri", sa.Text(), nullable=False),
        sa.Column("code_challenge", sa.String(length=128), nullable=False),
        sa.Column("resource", sa.Text(), nullable=True),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["client_id"],
            ["oauth_clients.client_id"],
            name=op.f("fk_oauth_codes_client_id_oauth_clients"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_oauth_codes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("code_hash", name=op.f("pk_oauth_codes")),
    )
    with op.batch_alter_table("oauth_codes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_oauth_codes_client_id"), ["client_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_oauth_codes_user_id"), ["user_id"], unique=False)

    op.create_table(
        "oauth_tokens",
        sa.Column("access_hash", sa.String(length=64), nullable=False),
        sa.Column("refresh_hash", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=512), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("resource", sa.Text(), nullable=True),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["client_id"],
            ["oauth_clients.client_id"],
            name=op.f("fk_oauth_tokens_client_id_oauth_clients"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_oauth_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("access_hash", name=op.f("pk_oauth_tokens")),
        sa.UniqueConstraint("refresh_hash", name=op.f("uq_oauth_tokens_refresh_hash")),
    )
    with op.batch_alter_table("oauth_tokens", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_oauth_tokens_client_id"), ["client_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_oauth_tokens_user_id"), ["user_id"], unique=False)

    op.create_table(
        "spaces",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_spaces_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_spaces")),
    )
    op.create_table(
        "web_sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_web_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_web_sessions")),
    )
    with op.batch_alter_table("web_sessions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_web_sessions_user_id"), ["user_id"], unique=False)

    op.create_table(
        "invites",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("space_id", sa.String(length=36), nullable=False),
        sa.Column("invited_by", sa.String(length=36), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_by", sa.String(length=36), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["accepted_by"],
            ["users.id"],
            name=op.f("fk_invites_accepted_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by"],
            ["users.id"],
            name=op.f("fk_invites_invited_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"], ["spaces.id"], name=op.f("fk_invites_space_id_spaces"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_invites")),
    )
    with op.batch_alter_table("invites", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_invites_space_id"), ["space_id"], unique=False)

    op.create_table(
        "items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("space_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("author_kind", sa.String(length=10), nullable=False),
        sa.Column("shared_by", sa.String(length=36), nullable=True),
        sa.Column("via", sa.String(length=100), nullable=False),
        sa.Column("source_item_ids", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retracted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "author_kind in ('person', 'assistant', 'orbit')", name=op.f("ck_items_author_kind")
        ),
        sa.CheckConstraint("kind in ('note', 'plan')", name=op.f("ck_items_kind")),
        sa.ForeignKeyConstraint(
            ["shared_by"], ["users.id"], name=op.f("fk_items_shared_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["space_id"], ["spaces.id"], name=op.f("fk_items_space_id_spaces"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_items")),
    )
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.create_index("ix_items_space_created", ["space_id", "created_at"], unique=False)

    op.create_table(
        "memory",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("space_id", sa.String(length=36), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("set_by", sa.String(length=36), nullable=True),
        sa.Column("via", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["set_by"], ["users.id"], name=op.f("fk_memory_set_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["space_id"], ["spaces.id"], name=op.f("fk_memory_space_id_spaces"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_memory")),
    )
    with op.batch_alter_table("memory", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_memory_space_id"), ["space_id"], unique=False)

    op.create_index(
        "uq_memory_current_key",
        "memory",
        ["space_id", sa.text('lower("key")')],
        unique=True,
        sqlite_where=sa.text("superseded_at IS NULL"),
        postgresql_where=sa.text("superseded_at IS NULL"),
    )

    op.create_table(
        "space_members",
        sa.Column("space_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notify_email", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name=op.f("fk_space_members_space_id_spaces"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_space_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("space_id", "user_id", name=op.f("pk_space_members")),
    )
    with op.batch_alter_table("space_members", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_space_members_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("space_members", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_space_members_user_id"))

    op.drop_table("space_members")
    op.drop_index("uq_memory_current_key", table_name="memory")
    with op.batch_alter_table("memory", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_memory_space_id"))

    op.drop_table("memory")
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index("ix_items_space_created")

    op.drop_table("items")
    with op.batch_alter_table("invites", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_invites_space_id"))

    op.drop_table("invites")
    with op.batch_alter_table("web_sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_web_sessions_user_id"))

    op.drop_table("web_sessions")
    op.drop_table("spaces")
    with op.batch_alter_table("oauth_tokens", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_oauth_tokens_user_id"))
        batch_op.drop_index(batch_op.f("ix_oauth_tokens_client_id"))

    op.drop_table("oauth_tokens")
    with op.batch_alter_table("oauth_codes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_oauth_codes_user_id"))
        batch_op.drop_index(batch_op.f("ix_oauth_codes_client_id"))

    op.drop_table("oauth_codes")
    op.drop_table("waitlist")
    op.drop_table("users")
    op.drop_table("oauth_clients")
    with op.batch_alter_table("magic_links", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_magic_links_email"))

    op.drop_table("magic_links")
