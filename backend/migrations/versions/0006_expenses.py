"""add expenses and withdrawals ledger

Revision ID: 0006_expenses
Revises: 0005_add_developer_user_role
Create Date: 2026-07-15 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0006_expenses"
down_revision: Union[str, Sequence[str], None] = "0005_add_developer_user_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


expense_type_enum = postgresql.ENUM("EXPENSE", "WITHDRAWAL", name="expense_type")


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("house_id", sa.Integer(), nullable=False),
        sa.Column("expense_type", expense_type_enum, nullable=False),
        sa.Column("currency_id", sa.String(length=12), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_user_id", sa.Integer(), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
        sa.CheckConstraint(
            "(voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) "
            "OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL "
            "AND void_reason IS NOT NULL)",
            name="ck_expenses_void_fields_consistent",
        ),
        sa.ForeignKeyConstraint(["currency_id"], ["currencies.ticker"]),
        sa.ForeignKeyConstraint(["house_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], name="fk_expenses_created_by_user_id_users"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"], ["users.id"], name="fk_expenses_updated_by_user_id_users"
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_user_id"], ["users.id"], name="fk_expenses_voided_by_user_id_users"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expenses_house_id", "expenses", ["house_id"])
    op.create_index("ix_expenses_currency_id", "expenses", ["currency_id"])
    op.create_index("ix_expenses_expense_type", "expenses", ["expense_type"])
    op.create_index("ix_expenses_created_by_user_id", "expenses", ["created_by_user_id"])
    op.create_index("ix_expenses_voided_by_user_id", "expenses", ["voided_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_expenses_voided_by_user_id", table_name="expenses")
    op.drop_index("ix_expenses_created_by_user_id", table_name="expenses")
    op.drop_index("ix_expenses_expense_type", table_name="expenses")
    op.drop_index("ix_expenses_currency_id", table_name="expenses")
    op.drop_index("ix_expenses_house_id", table_name="expenses")
    op.drop_table("expenses")
    expense_type_enum.drop(op.get_bind(), checkfirst=True)


# `create_table` above auto-creates the enum type; downgrade drops it explicitly,
# mirroring the pattern in 0001_initial_fx_ledger.
