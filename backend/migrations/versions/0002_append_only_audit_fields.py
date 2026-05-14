"""add append-only audit fields

Revision ID: 0002_append_only_audit_fields
Revises: 0001_initial_fx_ledger
Create Date: 2026-05-03 00:00:01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_append_only_audit_fields"
down_revision: Union[str, Sequence[str], None] = "0001_initial_fx_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEDGER_TABLES = ("orders", "house_exchanges", "journal_entries")


def add_audit_columns(table_name: str) -> None:
    op.add_column(table_name, sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column(table_name, sa.Column("updated_by_user_id", sa.Integer(), nullable=True))
    op.add_column(
        table_name,
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(table_name, sa.Column("voided_by_user_id", sa.Integer(), nullable=True))
    op.add_column(table_name, sa.Column("void_reason", sa.Text(), nullable=True))

    op.create_foreign_key(
        f"fk_{table_name}_created_by_user_id_users",
        table_name,
        "users",
        ["created_by_user_id"],
        ["id"],
    )
    op.create_foreign_key(
        f"fk_{table_name}_updated_by_user_id_users",
        table_name,
        "users",
        ["updated_by_user_id"],
        ["id"],
    )
    op.create_foreign_key(
        f"fk_{table_name}_voided_by_user_id_users",
        table_name,
        "users",
        ["voided_by_user_id"],
        ["id"],
    )

    op.create_index(f"ix_{table_name}_created_by_user_id", table_name, ["created_by_user_id"])
    op.create_index(f"ix_{table_name}_voided_by_user_id", table_name, ["voided_by_user_id"])
    op.create_check_constraint(
        f"ck_{table_name}_void_fields_consistent",
        table_name,
        "(voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) "
        "OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL "
        "AND void_reason IS NOT NULL)",
    )


def drop_audit_columns(table_name: str) -> None:
    op.drop_constraint(f"ck_{table_name}_void_fields_consistent", table_name, type_="check")
    op.drop_index(f"ix_{table_name}_voided_by_user_id", table_name=table_name)
    op.drop_index(f"ix_{table_name}_created_by_user_id", table_name=table_name)

    op.drop_constraint(
        f"fk_{table_name}_voided_by_user_id_users",
        table_name,
        type_="foreignkey",
    )
    op.drop_constraint(
        f"fk_{table_name}_updated_by_user_id_users",
        table_name,
        type_="foreignkey",
    )
    op.drop_constraint(
        f"fk_{table_name}_created_by_user_id_users",
        table_name,
        type_="foreignkey",
    )

    op.drop_column(table_name, "void_reason")
    op.drop_column(table_name, "voided_by_user_id")
    op.drop_column(table_name, "voided_at")
    op.drop_column(table_name, "updated_by_user_id")
    op.drop_column(table_name, "created_by_user_id")


def upgrade() -> None:
    for table_name in LEDGER_TABLES:
        add_audit_columns(table_name)


def downgrade() -> None:
    for table_name in reversed(LEDGER_TABLES):
        drop_audit_columns(table_name)

