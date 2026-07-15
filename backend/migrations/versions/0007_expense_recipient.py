"""add withdrawal recipient to expenses

Revision ID: 0007_expense_recipient
Revises: 0006_expenses
Create Date: 2026-07-15 01:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_expense_recipient"
down_revision: Union[str, Sequence[str], None] = "0006_expenses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("recipient_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_expenses_recipient_user_id_users",
        "expenses",
        "users",
        ["recipient_user_id"],
        ["id"],
    )
    op.create_index("ix_expenses_recipient_user_id", "expenses", ["recipient_user_id"])


def downgrade() -> None:
    op.drop_index("ix_expenses_recipient_user_id", table_name="expenses")
    op.drop_constraint("fk_expenses_recipient_user_id_users", "expenses", type_="foreignkey")
    op.drop_column("expenses", "recipient_user_id")
