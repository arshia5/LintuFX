from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class UserRole(str, Enum):
    CLIENT = "CLIENT"
    HOUSE = "HOUSE"
    DEVELOPER = "DEVELOPER"


class OrderType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class ExpenseType(str, Enum):
    EXPENSE = "EXPENSE"
    WITHDRAWAL = "WITHDRAWAL"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )


class Currency(TimestampMixin, Base):
    __tablename__ = "currencies"

    ticker: Mapped[str] = mapped_column(String(12), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(10), nullable=True)
    decimals: Mapped[int] = mapped_column(nullable=False, default=4, server_default="4")
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    wallets: Mapped[list[Wallet]] = relationship(back_populates="currency")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        Index("ix_users_role", "role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", native_enum=True, validate_strings=True),
        nullable=False,
    )
    username: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    surname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    wallets: Mapped[list[Wallet]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    client_orders: Mapped[list[Order]] = relationship(
        back_populates="client",
        foreign_keys="Order.client_id",
    )
    house_exchanges: Mapped[list[HouseExchange]] = relationship(
        back_populates="house",
        foreign_keys="HouseExchange.house_id",
    )


class EventLog(TimestampMixin, Base):
    __tablename__ = "event_logs"
    __table_args__ = (
        Index("ix_event_logs_event_type", "event_type"),
        Index("ix_event_logs_entity", "entity_type", "entity_id"),
        Index("ix_event_logs_actor_user_id", "actor_user_id"),
        Index("ix_event_logs_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=False)

    actor_user: Mapped[User | None] = relationship(foreign_keys=[actor_user_id])


class Wallet(TimestampMixin, Base):
    __tablename__ = "wallets"
    __table_args__ = (
        UniqueConstraint("user_id", "currency_id", name="uq_user_currency"),
        Index("ix_wallets_user_id", "user_id"),
        Index("ix_wallets_currency_id", "currency_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    currency_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    balance: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        default=Decimal("0"),
        server_default="0",
    )

    user: Mapped[User] = relationship(back_populates="wallets")
    currency: Mapped[Currency] = relationship(back_populates="wallets")
    outgoing_journal_entries: Mapped[list[JournalEntry]] = relationship(
        back_populates="from_wallet",
        foreign_keys="JournalEntry.from_wallet_id",
    )
    incoming_journal_entries: Mapped[list[JournalEntry]] = relationship(
        back_populates="to_wallet",
        foreign_keys="JournalEntry.to_wallet_id",
    )
    adjustments: Mapped[list[WalletAdjustment]] = relationship(back_populates="wallet")


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("amount_in > 0", name="ck_orders_amount_in_positive"),
        CheckConstraint("amount_out > 0", name="ck_orders_amount_out_positive"),
        CheckConstraint("exchange_rate > 0", name="ck_orders_exchange_rate_positive"),
        CheckConstraint(
            "currency_in_id <> currency_out_id",
            name="ck_orders_distinct_currencies",
        ),
        CheckConstraint(
            "(voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) "
            "OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL "
            "AND void_reason IS NOT NULL)",
            name="ck_orders_void_fields_consistent",
        ),
        Index("ix_orders_client_id", "client_id"),
        Index("ix_orders_currency_in_id", "currency_in_id"),
        Index("ix_orders_currency_out_id", "currency_out_id"),
        Index("ix_orders_created_by_user_id", "created_by_user_id"),
        Index("ix_orders_voided_by_user_id", "voided_by_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    order_type: Mapped[OrderType] = mapped_column(
        SAEnum(OrderType, name="order_type", native_enum=True, validate_strings=True),
        nullable=False,
    )
    currency_in_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    currency_out_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    amount_in: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    amount_out: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    client: Mapped[User] = relationship(
        back_populates="client_orders",
        foreign_keys=[client_id],
    )
    currency_in: Mapped[Currency] = relationship(foreign_keys=[currency_in_id])
    currency_out: Mapped[Currency] = relationship(foreign_keys=[currency_out_id])
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
    updated_by_user: Mapped[User | None] = relationship(foreign_keys=[updated_by_user_id])
    voided_by_user: Mapped[User | None] = relationship(foreign_keys=[voided_by_user_id])


class WalletAdjustment(TimestampMixin, Base):
    __tablename__ = "wallet_adjustments"
    __table_args__ = (
        CheckConstraint("balance_before <> balance_after", name="ck_wallet_adjustments_changes_balance"),
        CheckConstraint("amount_delta <> 0", name="ck_wallet_adjustments_delta_nonzero"),
        Index("ix_wallet_adjustments_wallet_id", "wallet_id"),
        Index("ix_wallet_adjustments_currency_id", "currency_id"),
        Index("ix_wallet_adjustments_created_by_user_id", "created_by_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"), nullable=False)
    currency_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    balance_before: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    amount_delta: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    wallet: Mapped[Wallet] = relationship(back_populates="adjustments")
    currency: Mapped[Currency] = relationship()
    created_by_user: Mapped[User] = relationship(foreign_keys=[created_by_user_id])


class HouseExchange(TimestampMixin, Base):
    __tablename__ = "house_exchanges"
    __table_args__ = (
        CheckConstraint("amount_from > 0", name="ck_house_exchanges_amount_from_positive"),
        CheckConstraint("amount_to > 0", name="ck_house_exchanges_amount_to_positive"),
        CheckConstraint(
            "exchange_rate > 0",
            name="ck_house_exchanges_exchange_rate_positive",
        ),
        CheckConstraint(
            "currency_from_id <> currency_to_id",
            name="ck_house_exchanges_distinct_currencies",
        ),
        CheckConstraint(
            "(voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) "
            "OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL "
            "AND void_reason IS NOT NULL)",
            name="ck_house_exchanges_void_fields_consistent",
        ),
        Index("ix_house_exchanges_house_id", "house_id"),
        Index("ix_house_exchanges_currency_from_id", "currency_from_id"),
        Index("ix_house_exchanges_currency_to_id", "currency_to_id"),
        Index("ix_house_exchanges_created_by_user_id", "created_by_user_id"),
        Index("ix_house_exchanges_voided_by_user_id", "voided_by_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    currency_from_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    currency_to_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    amount_from: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    amount_to: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    house: Mapped[User] = relationship(
        back_populates="house_exchanges",
        foreign_keys=[house_id],
    )
    currency_from: Mapped[Currency] = relationship(foreign_keys=[currency_from_id])
    currency_to: Mapped[Currency] = relationship(foreign_keys=[currency_to_id])
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
    updated_by_user: Mapped[User | None] = relationship(foreign_keys=[updated_by_user_id])
    voided_by_user: Mapped[User | None] = relationship(foreign_keys=[voided_by_user_id])


class Expense(TimestampMixin, Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
        CheckConstraint(
            "(voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) "
            "OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL "
            "AND void_reason IS NOT NULL)",
            name="ck_expenses_void_fields_consistent",
        ),
        Index("ix_expenses_house_id", "house_id"),
        Index("ix_expenses_currency_id", "currency_id"),
        Index("ix_expenses_expense_type", "expense_type"),
        Index("ix_expenses_created_by_user_id", "created_by_user_id"),
        Index("ix_expenses_voided_by_user_id", "voided_by_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    expense_type: Mapped[ExpenseType] = mapped_column(
        SAEnum(ExpenseType, name="expense_type", native_enum=True, validate_strings=True),
        nullable=False,
    )
    currency_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    house: Mapped[User] = relationship(foreign_keys=[house_id])
    currency: Mapped[Currency] = relationship(foreign_keys=[currency_id])
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
    updated_by_user: Mapped[User | None] = relationship(foreign_keys=[updated_by_user_id])
    voided_by_user: Mapped[User | None] = relationship(foreign_keys=[voided_by_user_id])


class JournalEntry(TimestampMixin, Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_journal_entries_amount_positive"),
        CheckConstraint(
            "from_wallet_id <> to_wallet_id",
            name="ck_journal_entries_distinct_wallets",
        ),
        CheckConstraint(
            "(voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL) "
            "OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL "
            "AND void_reason IS NOT NULL)",
            name="ck_journal_entries_void_fields_consistent",
        ),
        Index("ix_journal_entries_from_wallet_id", "from_wallet_id"),
        Index("ix_journal_entries_to_wallet_id", "to_wallet_id"),
        Index("ix_journal_entries_currency_id", "currency_id"),
        Index("ix_journal_entries_created_by_user_id", "created_by_user_id"),
        Index("ix_journal_entries_voided_by_user_id", "voided_by_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    from_wallet_id: Mapped[int] = mapped_column(
        ForeignKey("wallets.id"),
        nullable=False,
    )
    to_wallet_id: Mapped[int] = mapped_column(
        ForeignKey("wallets.id"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency_id: Mapped[str] = mapped_column(
        ForeignKey("currencies.ticker"),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    from_wallet: Mapped[Wallet] = relationship(
        back_populates="outgoing_journal_entries",
        foreign_keys=[from_wallet_id],
    )
    to_wallet: Mapped[Wallet] = relationship(
        back_populates="incoming_journal_entries",
        foreign_keys=[to_wallet_id],
    )
    currency: Mapped[Currency] = relationship()
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
    updated_by_user: Mapped[User | None] = relationship(foreign_keys=[updated_by_user_id])
    voided_by_user: Mapped[User | None] = relationship(foreign_keys=[voided_by_user_id])
