"""add wallet adjustment audit log

Revision ID: 0003_wallet_adjustments
Revises: 0002_append_only_audit_fields
Create Date: 2026-05-03 00:00:02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_wallet_adjustments"
down_revision: Union[str, Sequence[str], None] = "0002_append_only_audit_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wallet_adjustments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("currency_id", sa.String(length=12), nullable=False),
        sa.Column("balance_before", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("balance_after", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("amount_delta", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "balance_before <> balance_after",
            name="ck_wallet_adjustments_changes_balance",
        ),
        sa.CheckConstraint(
            "amount_delta <> 0",
            name="ck_wallet_adjustments_delta_nonzero",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["currency_id"], ["currencies.ticker"]),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wallet_adjustments_created_by_user_id",
        "wallet_adjustments",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_wallet_adjustments_currency_id",
        "wallet_adjustments",
        ["currency_id"],
    )
    op.create_index(
        "ix_wallet_adjustments_wallet_id",
        "wallet_adjustments",
        ["wallet_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wallet_adjustments_wallet_id",
        table_name="wallet_adjustments",
    )
    op.drop_index(
        "ix_wallet_adjustments_currency_id",
        table_name="wallet_adjustments",
    )
    op.drop_index(
        "ix_wallet_adjustments_created_by_user_id",
        table_name="wallet_adjustments",
    )
    op.drop_table("wallet_adjustments")

