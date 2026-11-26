from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

GENERAL_TEMPLATE = {
    "id": "general",
    "name": "General",
    "description": "No specific purpose",
    "facts": [],
    "plan_sections": ["Summary", "Next steps", "To settle"],
    "combine_hint": "",
    "tips": [
        "Share a note or link everyone should see",
        "Save a standing fact such as a date or a budget",
    ],
}


def upgrade() -> None:
    general_json = json.dumps(GENERAL_TEMPLATE, separators=(",", ":")).replace("'", "''")
    op.add_column(
        "spaces",
        sa.Column("template_id", sa.String(length=40), server_default="general", nullable=False),
    )
    op.add_column(
        "spaces",
        sa.Column(
            "template", sa.JSON(), server_default=sa.text(f"'{general_json}'"), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_column("spaces", "template")
    op.drop_column("spaces", "template_id")
