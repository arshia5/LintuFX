"""add developer user role

Revision ID: 0005_add_developer_user_role
Revises: 0004_event_logs
Create Date: 2026-05-18 00:00:00
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0005_add_developer_user_role"
down_revision: Union[str, Sequence[str], None] = "0004_event_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DEVELOPER'")


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'HOUSE' WHERE role = 'DEVELOPER'")
    op.execute("ALTER TYPE user_role RENAME TO user_role_old")
    op.execute("CREATE TYPE user_role AS ENUM ('CLIENT', 'HOUSE')")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE user_role "
        "USING role::text::user_role"
    )
    op.execute("DROP TYPE user_role_old")
