from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import Session

from .models import (
    Currency,
    EventLog,
    Expense,
    HouseExchange,
    JournalEntry,
    Order,
    User,
    UserRole,
    Wallet,
)


ZERO = Decimal("0")


@dataclass(frozen=True)
class OrderEffect:
    client_id: int
    currency_in_id: str
    currency_out_id: str
    amount_in: Decimal
    amount_out: Decimal


@dataclass(frozen=True)
class HouseExchangeEffect:
    house_id: int
    currency_from_id: str
    currency_to_id: str
    amount_from: Decimal
    amount_to: Decimal


@dataclass(frozen=True)
class ExpenseEffect:
    house_id: int
    currency_id: str
    amount: Decimal


@dataclass(frozen=True)
class JournalEffect:
    from_wallet_id: int
    to_wallet_id: int
    currency_id: str
    amount: Decimal


def commit_or_409(db: Session, detail: str = "Database constraint violated") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc


def flush_or_409(db: Session, detail: str = "Database constraint violated") -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc


def event_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {key: event_value(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [event_value(item) for item in value]
    return value


def model_snapshot(model: object) -> dict[str, Any]:
    redacted = {"password_hash"}
    mapper = inspect(model).mapper
    snapshot: dict[str, Any] = {}
    for column in mapper.column_attrs:
        key = column.key
        if key in redacted:
            snapshot[key] = "[REDACTED]"
        else:
            snapshot[key] = event_value(getattr(model, key))
    return snapshot


def log_event(
    db: Session,
    event_type: str,
    entity_type: str,
    entity_id: int | None,
    actor_user_id: int | None,
    details: dict[str, Any],
) -> EventLog:
    event = EventLog(
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        details=event_value(details),
    )
    db.add(event)
    return event


def get_currency_or_404(db: Session, ticker: str) -> Currency:
    currency = db.get(Currency, ticker)
    if not currency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Currency {ticker} not found",
        )
    return currency


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )
    return user


def get_wallet_or_404(db: Session, wallet_id: int, lock: bool = False) -> Wallet:
    if not lock:
        wallet = db.get(Wallet, wallet_id)
    else:
        wallet = db.scalar(select(Wallet).where(Wallet.id == wallet_id).with_for_update())

    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wallet {wallet_id} not found",
        )
    return wallet


def ensure_user_role(db: Session, user_id: int, role: UserRole, label: str) -> User:
    user = get_user_or_404(db, user_id)
    if user.role != role:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} must reference a {role.value} user",
        )
    return user


def ensure_currency_pair(db: Session, first_currency_id: str, second_currency_id: str) -> None:
    if first_currency_id == second_currency_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency fields must reference different currencies",
        )
    get_currency_or_404(db, first_currency_id)
    get_currency_or_404(db, second_currency_id)


def get_or_create_wallet(db: Session, user_id: int, currency_id: str) -> Wallet:
    wallet = db.scalar(
        select(Wallet)
        .where(Wallet.user_id == user_id, Wallet.currency_id == currency_id)
        .with_for_update()
    )
    if wallet:
        return wallet

    wallet = Wallet(user_id=user_id, currency_id=currency_id, balance=ZERO)
    db.add(wallet)
    db.flush()
    return wallet


def adjust_wallet(wallet: Wallet, amount: Decimal) -> None:
    wallet.balance = (wallet.balance or ZERO) + amount


def order_effect_from_model(order: Order) -> OrderEffect:
    return OrderEffect(
        client_id=order.client_id,
        currency_in_id=order.currency_in_id,
        currency_out_id=order.currency_out_id,
        amount_in=order.amount_in,
        amount_out=order.amount_out,
    )


def validate_order_effect(db: Session, effect: OrderEffect) -> None:
    ensure_user_role(db, effect.client_id, UserRole.CLIENT, "client_id")
    ensure_currency_pair(db, effect.currency_in_id, effect.currency_out_id)


def apply_order_effect(db: Session, effect: OrderEffect, multiplier: int = 1) -> None:
    validate_order_effect(db, effect)
    direction = Decimal(multiplier)
    in_wallet = get_or_create_wallet(db, effect.client_id, effect.currency_in_id)
    out_wallet = get_or_create_wallet(db, effect.client_id, effect.currency_out_id)

    adjust_wallet(in_wallet, effect.amount_in * direction)
    adjust_wallet(out_wallet, -effect.amount_out * direction)


def house_exchange_effect_from_model(exchange: HouseExchange) -> HouseExchangeEffect:
    return HouseExchangeEffect(
        house_id=exchange.house_id,
        currency_from_id=exchange.currency_from_id,
        currency_to_id=exchange.currency_to_id,
        amount_from=exchange.amount_from,
        amount_to=exchange.amount_to,
    )


def validate_house_exchange_effect(db: Session, effect: HouseExchangeEffect) -> None:
    ensure_user_role(db, effect.house_id, UserRole.HOUSE, "house_id")
    ensure_currency_pair(db, effect.currency_from_id, effect.currency_to_id)


def apply_house_exchange_effect(
    db: Session,
    effect: HouseExchangeEffect,
    multiplier: int = 1,
) -> None:
    validate_house_exchange_effect(db, effect)
    direction = Decimal(multiplier)
    from_wallet = get_or_create_wallet(db, effect.house_id, effect.currency_from_id)
    to_wallet = get_or_create_wallet(db, effect.house_id, effect.currency_to_id)

    adjust_wallet(from_wallet, -effect.amount_from * direction)
    adjust_wallet(to_wallet, effect.amount_to * direction)


def expense_effect_from_model(expense: Expense) -> ExpenseEffect:
    return ExpenseEffect(
        house_id=expense.house_id,
        currency_id=expense.currency_id,
        amount=expense.amount,
    )


def validate_expense_effect(db: Session, effect: ExpenseEffect) -> None:
    ensure_user_role(db, effect.house_id, UserRole.HOUSE, "house_id")
    get_currency_or_404(db, effect.currency_id)


def apply_expense_effect(db: Session, effect: ExpenseEffect, multiplier: int = 1) -> None:
    validate_expense_effect(db, effect)
    direction = Decimal(multiplier)
    wallet = get_or_create_wallet(db, effect.house_id, effect.currency_id)
    adjust_wallet(wallet, -effect.amount * direction)


def journal_effect_from_model(entry: JournalEntry) -> JournalEffect:
    return JournalEffect(
        from_wallet_id=entry.from_wallet_id,
        to_wallet_id=entry.to_wallet_id,
        currency_id=entry.currency_id,
        amount=entry.amount,
    )


def validate_journal_effect(
    db: Session,
    effect: JournalEffect,
    lock_wallets: bool = False,
) -> tuple[Wallet, Wallet]:
    if effect.from_wallet_id == effect.to_wallet_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_wallet_id and to_wallet_id must be different",
        )

    get_currency_or_404(db, effect.currency_id)
    from_wallet = get_wallet_or_404(db, effect.from_wallet_id, lock=lock_wallets)
    to_wallet = get_wallet_or_404(db, effect.to_wallet_id, lock=lock_wallets)

    if from_wallet.currency_id != effect.currency_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_wallet currency must match journal currency_id",
        )
    if to_wallet.currency_id != effect.currency_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to_wallet currency must match journal currency_id",
        )
    return from_wallet, to_wallet


def apply_journal_effect(db: Session, effect: JournalEffect, multiplier: int = 1) -> None:
    from_wallet, to_wallet = validate_journal_effect(db, effect, lock_wallets=True)
    direction = Decimal(multiplier)

    adjust_wallet(from_wallet, -effect.amount * direction)
    adjust_wallet(to_wallet, effect.amount * direction)
