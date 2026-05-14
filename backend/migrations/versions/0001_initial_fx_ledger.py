"""initial fx ledger schema

Revision ID: 0001_initial_fx_ledger
Revises:
Create Date: 2026-05-03 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_initial_fx_ledger"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


user_role_enum = postgresql.ENUM("CLIENT", "HOUSE", name="user_role")
order_type_enum = postgresql.ENUM("BUY", "SELL", name="order_type")


def upgrade() -> None:
    op.create_table(
        "currencies",
        sa.Column("ticker", sa.String(length=12), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=True),
        sa.Column("decimals", sa.Integer(), server_default="4", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("ticker"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("surname", sa.String(length=120), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "wallets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("currency_id", sa.String(length=12), nullable=False),
        sa.Column(
            "balance",
            sa.Numeric(precision=18, scale=4),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["currency_id"], ["currencies.ticker"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "currency_id", name="uq_user_currency"),
    )
    op.create_index("ix_wallets_currency_id", "wallets", ["currency_id"])
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"])

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("order_type", order_type_enum, nullable=False),
        sa.Column("currency_in_id", sa.String(length=12), nullable=False),
        sa.Column("currency_out_id", sa.String(length=12), nullable=False),
        sa.Column("amount_in", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("amount_out", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("exchange_rate", sa.Numeric(precision=18, scale=8), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("amount_in > 0", name="ck_orders_amount_in_positive"),
        sa.CheckConstraint("amount_out > 0", name="ck_orders_amount_out_positive"),
        sa.CheckConstraint("exchange_rate > 0", name="ck_orders_exchange_rate_positive"),
        sa.CheckConstraint(
            "currency_in_id <> currency_out_id",
            name="ck_orders_distinct_currencies",
        ),
        sa.ForeignKeyConstraint(["client_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["currency_in_id"], ["currencies.ticker"]),
        sa.ForeignKeyConstraint(["currency_out_id"], ["currencies.ticker"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_client_id", "orders", ["client_id"])
    op.create_index("ix_orders_currency_in_id", "orders", ["currency_in_id"])
    op.create_index("ix_orders_currency_out_id", "orders", ["currency_out_id"])

    op.create_table(
        "house_exchanges",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("house_id", sa.Integer(), nullable=False),
        sa.Column("currency_from_id", sa.String(length=12), nullable=False),
        sa.Column("currency_to_id", sa.String(length=12), nullable=False),
        sa.Column("amount_from", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("amount_to", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("exchange_rate", sa.Numeric(precision=18, scale=8), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "amount_from > 0",
            name="ck_house_exchanges_amount_from_positive",
        ),
        sa.CheckConstraint(
            "amount_to > 0",
            name="ck_house_exchanges_amount_to_positive",
        ),
        sa.CheckConstraint(
            "exchange_rate > 0",
            name="ck_house_exchanges_exchange_rate_positive",
        ),
        sa.CheckConstraint(
            "currency_from_id <> currency_to_id",
            name="ck_house_exchanges_distinct_currencies",
        ),
        sa.ForeignKeyConstraint(["currency_from_id"], ["currencies.ticker"]),
        sa.ForeignKeyConstraint(["currency_to_id"], ["currencies.ticker"]),
        sa.ForeignKeyConstraint(["house_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_house_exchanges_house_id", "house_exchanges", ["house_id"])
    op.create_index(
        "ix_house_exchanges_currency_from_id",
        "house_exchanges",
        ["currency_from_id"],
    )
    op.create_index(
        "ix_house_exchanges_currency_to_id",
        "house_exchanges",
        ["currency_to_id"],
    )

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("from_wallet_id", sa.Integer(), nullable=False),
        sa.Column("to_wallet_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("currency_id", sa.String(length=12), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_journal_entries_amount_positive"),
        sa.CheckConstraint(
            "from_wallet_id <> to_wallet_id",
            name="ck_journal_entries_distinct_wallets",
        ),
        sa.ForeignKeyConstraint(["currency_id"], ["currencies.ticker"]),
        sa.ForeignKeyConstraint(["from_wallet_id"], ["wallets.id"]),
        sa.ForeignKeyConstraint(["to_wallet_id"], ["wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_journal_entries_from_wallet_id",
        "journal_entries",
        ["from_wallet_id"],
    )
    op.create_index(
        "ix_journal_entries_to_wallet_id",
        "journal_entries",
        ["to_wallet_id"],
    )
    op.create_index("ix_journal_entries_currency_id", "journal_entries", ["currency_id"])


def downgrade() -> None:
    op.drop_index("ix_journal_entries_currency_id", table_name="journal_entries")
    op.drop_index("ix_journal_entries_to_wallet_id", table_name="journal_entries")
    op.drop_index("ix_journal_entries_from_wallet_id", table_name="journal_entries")
    op.drop_table("journal_entries")

    op.drop_index("ix_house_exchanges_currency_to_id", table_name="house_exchanges")
    op.drop_index("ix_house_exchanges_currency_from_id", table_name="house_exchanges")
    op.drop_index("ix_house_exchanges_house_id", table_name="house_exchanges")
    op.drop_table("house_exchanges")

    op.drop_index("ix_orders_currency_out_id", table_name="orders")
    op.drop_index("ix_orders_currency_in_id", table_name="orders")
    op.drop_index("ix_orders_client_id", table_name="orders")
    op.drop_table("orders")

    op.drop_index("ix_wallets_user_id", table_name="wallets")
    op.drop_index("ix_wallets_currency_id", table_name="wallets")
    op.drop_table("wallets")

    op.drop_index("ix_users_role", table_name="users")
    op.drop_table("users")

    op.drop_table("currencies")

    order_type_enum.drop(op.get_bind(), checkfirst=True)
    user_role_enum.drop(op.get_bind(), checkfirst=True)
