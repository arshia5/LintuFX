"""add event log table

Revision ID: 0004_event_logs
Revises: 0003_wallet_adjustments
Create Date: 2026-05-04 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_event_logs"
down_revision: Union[str, Sequence[str], None] = "0003_wallet_adjustments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_logs_actor_user_id", "event_logs", ["actor_user_id"])
    op.create_index("ix_event_logs_created_at", "event_logs", ["created_at"])
    op.create_index(
        "ix_event_logs_entity",
        "event_logs",
        ["entity_type", "entity_id"],
    )
    op.create_index("ix_event_logs_event_type", "event_logs", ["event_type"])


def downgrade() -> None:
    op.drop_index("ix_event_logs_event_type", table_name="event_logs")
    op.drop_index("ix_event_logs_entity", table_name="event_logs")
    op.drop_index("ix_event_logs_created_at", table_name="event_logs")
    op.drop_index("ix_event_logs_actor_user_id", table_name="event_logs")
    op.drop_table("event_logs")

