from decimal import Decimal
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    Currency,
    EventLog,
    HouseExchange,
    JournalEntry,
    Order,
    OrderType,
    User,
    UserRole,
    Wallet,
    WalletAdjustment,
)
from .schemas import (
    BalanceDirection,
    ClientBalanceReport,
    CurrencyCreate,
    CurrencyRead,
    CurrencyUpdate,
    EventLogRead,
    FreshStartRead,
    FreshStartRequest,
    HouseExchangeCreate,
    HouseExchangeCorrectionCreate,
    HouseExchangeCorrectionRead,
    HouseExchangeRead,
    JournalEntryCreate,
    JournalEntryCorrectionCreate,
    JournalEntryCorrectionRead,
    JournalEntryRead,
    LoginRequest,
    OrderCreate,
    OrderCorrectionCreate,
    OrderCorrectionRead,
    OrderRead,
    TokenRead,
    UserCreate,
    UserRead,
    UserUpdate,
    WalletAdjustmentRead,
    WalletBalanceAdjustmentCreate,
    WalletCreate,
    WalletRead,
    VoidRequest,
    normalize_ticker,
)
from .auth import require_house_user
from .config import get_settings
from .security import create_access_token, hash_password, verify_password
from .report_exports import build_client_statement_xlsx, date_key
from .services import (
    HouseExchangeEffect,
    JournalEffect,
    OrderEffect,
    apply_house_exchange_effect,
    apply_journal_effect,
    apply_order_effect,
    commit_or_409,
    get_currency_or_404,
    get_user_or_404,
    get_wallet_or_404,
    house_exchange_effect_from_model,
    journal_effect_from_model,
    log_event,
    model_snapshot,
    order_effect_from_model,
    flush_or_409,
)


public_router = APIRouter()
router = APIRouter()


def pagination(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> tuple[int, int]:
    return skip, limit


def append_only_error(record_name: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail=(
            f"{record_name} records are append-only. Use the void endpoint to reverse "
            "a posted record or the corrections endpoint to void and replace it."
        ),
    )


def ensure_not_voided(record: Order | HouseExchange | JournalEntry, record_name: str) -> None:
    if record.voided_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{record_name} is already voided",
        )


def payload_details(payload: object) -> dict:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_none=True)
    return {}


def deleted_count(rowcount: int | None) -> int:
    return 0 if rowcount is None or rowcount < 0 else rowcount


@public_router.get("/", tags=["health"])
def root() -> dict[str, str]:
    return {"status": "ok", "service": "fx-ledger-api"}


@public_router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@public_router.post("/auth/login", response_model=TokenRead, tags=["auth"])
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenRead:
    user = db.scalar(select(User).where(User.username == payload.username))
    if (
        user is None
        or user.role != UserRole.HOUSE
        or not verify_password(payload.password, user.password_hash)
    ):
        log_event(
            db,
            event_type="auth.login_failed",
            entity_type="auth",
            entity_id=None,
            actor_user_id=None,
            details={"username": payload.username},
        )
        commit_or_409(db, "Failed to log authentication event")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid house credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    expires_delta = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    token = create_access_token(
        subject=str(user.id),
        secret_key=settings.jwt_secret_key,
        expires_delta=expires_delta,
        extra_claims={"role": user.role.value, "username": user.username},
    )
    log_event(
        db,
        event_type="auth.login_succeeded",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=user.id,
        details={"username": user.username, "role": user.role.value},
    )
    commit_or_409(db, "Failed to log authentication event")
    return TokenRead(
        access_token=token,
        expires_in=int(expires_delta.total_seconds()),
    )


@router.post("/admin/fresh-start", response_model=FreshStartRead, tags=["admin"])
def fresh_start(
    payload: FreshStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> FreshStartRead:
    _ = payload
    preserved_house_users = db.scalar(
        select(func.count()).select_from(User).where(User.role == UserRole.HOUSE)
    )
    delete_order = [
        ("event_logs", delete(EventLog)),
        ("journal_entries", delete(JournalEntry)),
        ("orders", delete(Order)),
        ("house_exchanges", delete(HouseExchange)),
        ("wallet_adjustments", delete(WalletAdjustment)),
        ("wallets", delete(Wallet)),
        ("client_users", delete(User).where(User.role != UserRole.HOUSE)),
        ("currencies", delete(Currency)),
    ]

    deleted: dict[str, int] = {}
    for name, statement in delete_order:
        result = db.execute(statement.execution_options(synchronize_session=False))
        deleted[name] = deleted_count(result.rowcount)

    commit_or_409(db, "Fresh start cleanup violates a database constraint")
    db.refresh(current_user)
    return FreshStartRead(
        deleted=deleted,
        preserved_house_users=preserved_house_users or 0,
    )


@router.post(
    "/currencies",
    response_model=CurrencyRead,
    status_code=status.HTTP_201_CREATED,
    tags=["currencies"],
)
def create_currency(
    payload: CurrencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> Currency:
    currency = Currency(**payload.model_dump())
    db.add(currency)
    flush_or_409(db, "Currency ticker already exists or violates a constraint")
    log_event(
        db,
        event_type="currency.created",
        entity_type="currency",
        entity_id=None,
        actor_user_id=current_user.id,
        details={"after": model_snapshot(currency)},
    )
    commit_or_409(db, "Currency ticker already exists or violates a constraint")
    db.refresh(currency)
    return currency


@router.get("/currencies", response_model=list[CurrencyRead], tags=["currencies"])
def list_currencies(
    is_active: bool | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[Currency]:
    skip, limit = page
    stmt = select(Currency)
    if is_active is not None:
        stmt = stmt.where(Currency.is_active == is_active)
    stmt = stmt.order_by(Currency.ticker).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@router.get("/currencies/{ticker}", response_model=CurrencyRead, tags=["currencies"])
def get_currency(ticker: str, db: Session = Depends(get_db)) -> Currency:
    return get_currency_or_404(db, normalize_ticker(ticker))


@router.patch("/currencies/{ticker}", response_model=CurrencyRead, tags=["currencies"])
def update_currency(
    ticker: str,
    payload: CurrencyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> Currency:
    currency = get_currency_or_404(db, normalize_ticker(ticker))
    before = model_snapshot(currency)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(currency, key, value)
    log_event(
        db,
        event_type="currency.updated",
        entity_type="currency",
        entity_id=None,
        actor_user_id=current_user.id,
        details={"before": before, "after": model_snapshot(currency)},
    )
    commit_or_409(db, "Currency update violates a constraint")
    db.refresh(currency)
    return currency


@router.delete(
    "/currencies/{ticker}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["currencies"],
)
def delete_currency(
    ticker: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> None:
    currency = get_currency_or_404(db, normalize_ticker(ticker))
    before = model_snapshot(currency)
    log_event(
        db,
        event_type="currency.deleted",
        entity_type="currency",
        entity_id=None,
        actor_user_id=current_user.id,
        details={"before": before},
    )
    db.delete(currency)
    commit_or_409(db, "Currency is still referenced by ledger records")


@router.post(
    "/users",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    tags=["users"],
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> User:
    data = payload.model_dump(exclude={"password"})
    if payload.password:
        data["password_hash"] = hash_password(payload.password)
    user = User(**data)
    db.add(user)
    flush_or_409(db, "Username already exists or user violates a constraint")
    log_event(
        db,
        event_type="user.created",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=current_user.id,
        details={"after": model_snapshot(user)},
    )
    commit_or_409(db, "Username already exists or user violates a constraint")
    db.refresh(user)
    return user


@router.get("/users", response_model=list[UserRead], tags=["users"])
def list_users(
    role: UserRole | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[User]:
    skip, limit = page
    stmt = select(User)
    if role is not None:
        stmt = stmt.where(User.role == role)
    stmt = stmt.order_by(User.id).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@router.get("/users/{user_id}", response_model=UserRead, tags=["users"])
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    return get_user_or_404(db, user_id)


@router.patch("/users/{user_id}", response_model=UserRead, tags=["users"])
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> User:
    user = get_user_or_404(db, user_id)
    before = model_snapshot(user)
    data = payload.model_dump(exclude_unset=True, exclude={"password"})
    if payload.password:
        data["password_hash"] = hash_password(payload.password)

    if "role" in data and data["role"] != user.role:
        has_nonzero_wallet = db.scalar(
            select(Wallet.id)
            .where(Wallet.user_id == user.id, Wallet.balance != 0)
            .limit(1)
        )
        if has_nonzero_wallet is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot change role while the user has non-zero wallet balances",
            )

        if user.role == UserRole.CLIENT:
            has_orders = db.scalar(
                select(Order.id).where(Order.client_id == user.id).limit(1)
            )
            if has_orders is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot change a client role while orders reference the user",
                )

        if user.role == UserRole.HOUSE:
            has_exchanges = db.scalar(
                select(HouseExchange.id).where(HouseExchange.house_id == user.id).limit(1)
            )
            if has_exchanges is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot change a house role while house exchanges reference the user",
                )

    for key, value in data.items():
        setattr(user, key, value)
    log_event(
        db,
        event_type="user.updated",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=current_user.id,
        details={"before": before, "after": model_snapshot(user)},
    )
    commit_or_409(db, "User update violates a constraint")
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["users"])
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> None:
    user = get_user_or_404(db, user_id)
    has_nonzero_wallet = db.scalar(
        select(Wallet.id).where(Wallet.user_id == user.id, Wallet.balance != 0).limit(1)
    )
    if has_nonzero_wallet is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a user with non-zero wallet balances",
        )
    before = model_snapshot(user)
    log_event(
        db,
        event_type="user.deleted",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=current_user.id,
        details={"before": before},
    )
    db.delete(user)
    commit_or_409(db, "User is still referenced by orders or house exchanges")


@router.post(
    "/wallets",
    response_model=WalletRead,
    status_code=status.HTTP_201_CREATED,
    tags=["wallets"],
)
def create_wallet(
    payload: WalletCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> Wallet:
    get_user_or_404(db, payload.user_id)
    get_currency_or_404(db, payload.currency_id)
    wallet = Wallet(**payload.model_dump())
    db.add(wallet)
    flush_or_409(db, "Wallet already exists for this user and currency")
    log_event(
        db,
        event_type="wallet.created",
        entity_type="wallet",
        entity_id=wallet.id,
        actor_user_id=current_user.id,
        details={"after": model_snapshot(wallet)},
    )
    commit_or_409(db, "Wallet already exists for this user and currency")
    db.refresh(wallet)
    return wallet


@router.get("/wallets", response_model=list[WalletRead], tags=["wallets"])
def list_wallets(
    user_id: int | None = None,
    currency_id: str | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[Wallet]:
    skip, limit = page
    stmt = select(Wallet)
    if user_id is not None:
        stmt = stmt.where(Wallet.user_id == user_id)
    if currency_id is not None:
        stmt = stmt.where(Wallet.currency_id == normalize_ticker(currency_id))
    stmt = stmt.order_by(Wallet.user_id, Wallet.currency_id).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@router.get("/wallets/{wallet_id}", response_model=WalletRead, tags=["wallets"])
def get_wallet(wallet_id: int, db: Session = Depends(get_db)) -> Wallet:
    return get_wallet_or_404(db, wallet_id)


@router.patch("/wallets/{wallet_id}", response_model=WalletRead, tags=["wallets"])
def update_wallet(
    wallet_id: int,
    db: Session = Depends(get_db),
) -> Wallet:
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail=(
            "Wallet balances cannot be edited directly. Use "
            "POST /wallets/{wallet_id}/balance-adjustments with a reason."
        ),
    )


@router.post(
    "/wallets/{wallet_id}/balance-adjustments",
    response_model=WalletAdjustmentRead,
    status_code=status.HTTP_201_CREATED,
    tags=["wallets"],
)
def create_wallet_balance_adjustment(
    wallet_id: int,
    payload: WalletBalanceAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> WalletAdjustment:
    wallet = get_wallet_or_404(db, wallet_id, lock=True)
    balance_before = wallet.balance
    if payload.balance_after is not None:
        balance_after = payload.balance_after
        amount_delta = balance_after - balance_before
    else:
        amount_delta = payload.amount_delta or Decimal("0")
        balance_after = balance_before + amount_delta

    if amount_delta == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Balance adjustment must change the wallet balance",
        )

    wallet.balance = balance_after
    adjustment = WalletAdjustment(
        wallet_id=wallet.id,
        currency_id=wallet.currency_id,
        balance_before=balance_before,
        balance_after=balance_after,
        amount_delta=amount_delta,
        reason=payload.reason,
        created_by_user_id=current_user.id,
    )
    db.add(adjustment)
    flush_or_409(db, "Wallet balance adjustment violates a constraint")
    log_event(
        db,
        event_type="wallet.balance_adjusted",
        entity_type="wallet_adjustment",
        entity_id=adjustment.id,
        actor_user_id=current_user.id,
        details={
            "wallet": model_snapshot(wallet),
            "adjustment": model_snapshot(adjustment),
        },
    )
    commit_or_409(db, "Wallet balance adjustment violates a constraint")
    db.refresh(adjustment)
    return adjustment


@router.get(
    "/wallet-adjustments",
    response_model=list[WalletAdjustmentRead],
    tags=["wallets"],
)
def list_wallet_adjustments(
    wallet_id: int | None = None,
    currency_id: str | None = None,
    created_by_user_id: int | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[WalletAdjustment]:
    skip, limit = page
    stmt = select(WalletAdjustment)
    if wallet_id is not None:
        stmt = stmt.where(WalletAdjustment.wallet_id == wallet_id)
    if currency_id is not None:
        stmt = stmt.where(WalletAdjustment.currency_id == normalize_ticker(currency_id))
    if created_by_user_id is not None:
        stmt = stmt.where(WalletAdjustment.created_by_user_id == created_by_user_id)
    stmt = stmt.order_by(WalletAdjustment.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@router.delete(
    "/wallets/{wallet_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["wallets"],
)
def delete_wallet(
    wallet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> None:
    wallet = get_wallet_or_404(db, wallet_id)
    if wallet.balance != Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only zero-balance wallets can be deleted",
        )
    before = model_snapshot(wallet)
    log_event(
        db,
        event_type="wallet.deleted",
        entity_type="wallet",
        entity_id=wallet.id,
        actor_user_id=current_user.id,
        details={"before": before},
    )
    db.delete(wallet)
    commit_or_409(db, "Wallet is still referenced by journal entries")


@router.post(
    "/orders",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
    tags=["orders"],
)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> Order:
    actor_id = current_user.id
    order = Order(**payload.model_dump(exclude_none=True), created_by_user_id=actor_id)
    effect = OrderEffect(
        client_id=order.client_id,
        currency_in_id=order.currency_in_id,
        currency_out_id=order.currency_out_id,
        amount_in=order.amount_in,
        amount_out=order.amount_out,
    )
    apply_order_effect(db, effect, multiplier=1)
    db.add(order)
    flush_or_409(db, "Order violates a constraint")
    log_event(
        db,
        event_type="order.created",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=actor_id,
        details={"payload": payload_details(payload), "after": model_snapshot(order)},
    )
    commit_or_409(db, "Order violates a constraint")
    db.refresh(order)
    return order


@router.get("/orders", response_model=list[OrderRead], tags=["orders"])
def list_orders(
    client_id: int | None = None,
    order_type: OrderType | None = None,
    currency_in_id: str | None = None,
    currency_out_id: str | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[Order]:
    skip, limit = page
    stmt = select(Order)
    if client_id is not None:
        stmt = stmt.where(Order.client_id == client_id)
    if order_type is not None:
        stmt = stmt.where(Order.order_type == order_type)
    if currency_in_id is not None:
        stmt = stmt.where(Order.currency_in_id == normalize_ticker(currency_in_id))
    if currency_out_id is not None:
        stmt = stmt.where(Order.currency_out_id == normalize_ticker(currency_out_id))
    stmt = stmt.order_by(Order.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@router.get("/orders/{order_id}", response_model=OrderRead, tags=["orders"])
def get_order(order_id: int, db: Session = Depends(get_db)) -> Order:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@router.patch("/orders/{order_id}", response_model=OrderRead, tags=["orders"])
def update_order(
    order_id: int,
    db: Session = Depends(get_db),
) -> Order:
    append_only_error("Order")


@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["orders"])
def delete_order(order_id: int, db: Session = Depends(get_db)) -> None:
    append_only_error("Order")


@router.post("/orders/{order_id}/void", response_model=OrderRead, tags=["orders"])
def void_order(
    order_id: int,
    payload: VoidRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> Order:
    actor_id = current_user.id
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    ensure_not_voided(order, "Order")
    before = model_snapshot(order)

    apply_order_effect(db, order_effect_from_model(order), multiplier=-1)
    order.voided_at = datetime.now(UTC)
    order.voided_by_user_id = actor_id
    order.void_reason = payload.reason
    order.updated_by_user_id = actor_id
    log_event(
        db,
        event_type="order.voided",
        entity_type="order",
        entity_id=order.id,
        actor_user_id=actor_id,
        details={"reason": payload.reason, "before": before, "after": model_snapshot(order)},
    )
    commit_or_409(db, "Order void violates a constraint")
    db.refresh(order)
    return order


@router.post(
    "/orders/{order_id}/corrections",
    response_model=OrderCorrectionRead,
    status_code=status.HTTP_201_CREATED,
    tags=["orders"],
)
def correct_order(
    order_id: int,
    payload: OrderCorrectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> OrderCorrectionRead:
    actor_id = current_user.id
    original = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    ensure_not_voided(original, "Order")
    original_before = model_snapshot(original)

    apply_order_effect(db, order_effect_from_model(original), multiplier=-1)
    original.voided_at = datetime.now(UTC)
    original.voided_by_user_id = actor_id
    original.void_reason = payload.correction_reason
    original.updated_by_user_id = actor_id

    correction_data = payload.model_dump(exclude={"correction_reason"}, exclude_none=True)
    correction = Order(**correction_data, created_by_user_id=actor_id)
    apply_order_effect(db, order_effect_from_model(correction), multiplier=1)
    db.add(correction)
    flush_or_409(db, "Order correction violates a constraint")
    log_event(
        db,
        event_type="order.corrected",
        entity_type="order",
        entity_id=original.id,
        actor_user_id=actor_id,
        details={
            "reason": payload.correction_reason,
            "voided_before": original_before,
            "voided_after": model_snapshot(original),
            "correction": model_snapshot(correction),
        },
    )

    commit_or_409(db, "Order correction violates a constraint")
    db.refresh(original)
    db.refresh(correction)
    return OrderCorrectionRead(voided_record=original, correction_record=correction)


@router.post(
    "/house-exchanges",
    response_model=HouseExchangeRead,
    status_code=status.HTTP_201_CREATED,
    tags=["house-exchanges"],
)
def create_house_exchange(
    payload: HouseExchangeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> HouseExchange:
    actor_id = current_user.id
    exchange = HouseExchange(**payload.model_dump(), created_by_user_id=actor_id)
    effect = HouseExchangeEffect(
        house_id=exchange.house_id,
        currency_from_id=exchange.currency_from_id,
        currency_to_id=exchange.currency_to_id,
        amount_from=exchange.amount_from,
        amount_to=exchange.amount_to,
    )
    apply_house_exchange_effect(db, effect, multiplier=1)
    db.add(exchange)
    flush_or_409(db, "House exchange violates a constraint")
    log_event(
        db,
        event_type="house_exchange.created",
        entity_type="house_exchange",
        entity_id=exchange.id,
        actor_user_id=actor_id,
        details={"payload": payload_details(payload), "after": model_snapshot(exchange)},
    )
    commit_or_409(db, "House exchange violates a constraint")
    db.refresh(exchange)
    return exchange


@router.get(
    "/house-exchanges",
    response_model=list[HouseExchangeRead],
    tags=["house-exchanges"],
)
def list_house_exchanges(
    house_id: int | None = None,
    currency_from_id: str | None = None,
    currency_to_id: str | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[HouseExchange]:
    skip, limit = page
    stmt = select(HouseExchange)
    if house_id is not None:
        stmt = stmt.where(HouseExchange.house_id == house_id)
    if currency_from_id is not None:
        stmt = stmt.where(HouseExchange.currency_from_id == normalize_ticker(currency_from_id))
    if currency_to_id is not None:
        stmt = stmt.where(HouseExchange.currency_to_id == normalize_ticker(currency_to_id))
    stmt = stmt.order_by(HouseExchange.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@router.get(
    "/house-exchanges/{exchange_id}",
    response_model=HouseExchangeRead,
    tags=["house-exchanges"],
)
def get_house_exchange(exchange_id: int, db: Session = Depends(get_db)) -> HouseExchange:
    exchange = db.get(HouseExchange, exchange_id)
    if not exchange:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="House exchange not found",
        )
    return exchange


@router.patch(
    "/house-exchanges/{exchange_id}",
    response_model=HouseExchangeRead,
    tags=["house-exchanges"],
)
def update_house_exchange(
    exchange_id: int,
    db: Session = Depends(get_db),
) -> HouseExchange:
    append_only_error("House exchange")


@router.delete(
    "/house-exchanges/{exchange_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["house-exchanges"],
)
def delete_house_exchange(exchange_id: int, db: Session = Depends(get_db)) -> None:
    append_only_error("House exchange")


@router.post(
    "/house-exchanges/{exchange_id}/void",
    response_model=HouseExchangeRead,
    tags=["house-exchanges"],
)
def void_house_exchange(
    exchange_id: int,
    payload: VoidRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> HouseExchange:
    actor_id = current_user.id
    exchange = db.scalar(
        select(HouseExchange).where(HouseExchange.id == exchange_id).with_for_update()
    )
    if not exchange:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="House exchange not found",
    )
    ensure_not_voided(exchange, "House exchange")
    before = model_snapshot(exchange)

    apply_house_exchange_effect(db, house_exchange_effect_from_model(exchange), multiplier=-1)
    exchange.voided_at = datetime.now(UTC)
    exchange.voided_by_user_id = actor_id
    exchange.void_reason = payload.reason
    exchange.updated_by_user_id = actor_id
    log_event(
        db,
        event_type="house_exchange.voided",
        entity_type="house_exchange",
        entity_id=exchange.id,
        actor_user_id=actor_id,
        details={"reason": payload.reason, "before": before, "after": model_snapshot(exchange)},
    )
    commit_or_409(db, "House exchange void violates a constraint")
    db.refresh(exchange)
    return exchange


@router.post(
    "/house-exchanges/{exchange_id}/corrections",
    response_model=HouseExchangeCorrectionRead,
    status_code=status.HTTP_201_CREATED,
    tags=["house-exchanges"],
)
def correct_house_exchange(
    exchange_id: int,
    payload: HouseExchangeCorrectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> HouseExchangeCorrectionRead:
    actor_id = current_user.id
    original = db.scalar(
        select(HouseExchange).where(HouseExchange.id == exchange_id).with_for_update()
    )
    if not original:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="House exchange not found",
    )
    ensure_not_voided(original, "House exchange")
    original_before = model_snapshot(original)

    apply_house_exchange_effect(db, house_exchange_effect_from_model(original), multiplier=-1)
    original.voided_at = datetime.now(UTC)
    original.voided_by_user_id = actor_id
    original.void_reason = payload.correction_reason
    original.updated_by_user_id = actor_id

    correction_data = payload.model_dump(exclude={"correction_reason"})
    correction = HouseExchange(**correction_data, created_by_user_id=actor_id)
    apply_house_exchange_effect(db, house_exchange_effect_from_model(correction), multiplier=1)
    db.add(correction)
    flush_or_409(db, "House exchange correction violates a constraint")
    log_event(
        db,
        event_type="house_exchange.corrected",
        entity_type="house_exchange",
        entity_id=original.id,
        actor_user_id=actor_id,
        details={
            "reason": payload.correction_reason,
            "voided_before": original_before,
            "voided_after": model_snapshot(original),
            "correction": model_snapshot(correction),
        },
    )

    commit_or_409(db, "House exchange correction violates a constraint")
    db.refresh(original)
    db.refresh(correction)
    return HouseExchangeCorrectionRead(voided_record=original, correction_record=correction)


@router.post(
    "/journal-entries",
    response_model=JournalEntryRead,
    status_code=status.HTTP_201_CREATED,
    tags=["journal-entries"],
)
def create_journal_entry(
    payload: JournalEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> JournalEntry:
    actor_id = current_user.id
    entry = JournalEntry(**payload.model_dump(exclude_none=True), created_by_user_id=actor_id)
    effect = JournalEffect(
        from_wallet_id=entry.from_wallet_id,
        to_wallet_id=entry.to_wallet_id,
        currency_id=entry.currency_id,
        amount=entry.amount,
    )
    apply_journal_effect(db, effect, multiplier=1)
    db.add(entry)
    flush_or_409(db, "Journal entry violates a constraint")
    log_event(
        db,
        event_type="journal_entry.created",
        entity_type="journal_entry",
        entity_id=entry.id,
        actor_user_id=actor_id,
        details={"payload": payload_details(payload), "after": model_snapshot(entry)},
    )
    commit_or_409(db, "Journal entry violates a constraint")
    db.refresh(entry)
    return entry


@router.get(
    "/journal-entries",
    response_model=list[JournalEntryRead],
    tags=["journal-entries"],
)
def list_journal_entries(
    from_wallet_id: int | None = None,
    to_wallet_id: int | None = None,
    currency_id: str | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[JournalEntry]:
    skip, limit = page
    stmt = select(JournalEntry)
    if from_wallet_id is not None:
        stmt = stmt.where(JournalEntry.from_wallet_id == from_wallet_id)
    if to_wallet_id is not None:
        stmt = stmt.where(JournalEntry.to_wallet_id == to_wallet_id)
    if currency_id is not None:
        stmt = stmt.where(JournalEntry.currency_id == normalize_ticker(currency_id))
    stmt = stmt.order_by(JournalEntry.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@router.get(
    "/journal-entries/{entry_id}",
    response_model=JournalEntryRead,
    tags=["journal-entries"],
)
def get_journal_entry(entry_id: int, db: Session = Depends(get_db)) -> JournalEntry:
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )
    return entry


@router.patch(
    "/journal-entries/{entry_id}",
    response_model=JournalEntryRead,
    tags=["journal-entries"],
)
def update_journal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
) -> JournalEntry:
    append_only_error("Journal entry")


@router.delete(
    "/journal-entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["journal-entries"],
)
def delete_journal_entry(entry_id: int, db: Session = Depends(get_db)) -> None:
    append_only_error("Journal entry")


@router.post(
    "/journal-entries/{entry_id}/void",
    response_model=JournalEntryRead,
    tags=["journal-entries"],
)
def void_journal_entry(
    entry_id: int,
    payload: VoidRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> JournalEntry:
    actor_id = current_user.id
    entry = db.scalar(select(JournalEntry).where(JournalEntry.id == entry_id).with_for_update())
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )
    ensure_not_voided(entry, "Journal entry")
    before = model_snapshot(entry)

    apply_journal_effect(db, journal_effect_from_model(entry), multiplier=-1)
    entry.voided_at = datetime.now(UTC)
    entry.voided_by_user_id = actor_id
    entry.void_reason = payload.reason
    entry.updated_by_user_id = actor_id
    log_event(
        db,
        event_type="journal_entry.voided",
        entity_type="journal_entry",
        entity_id=entry.id,
        actor_user_id=actor_id,
        details={"reason": payload.reason, "before": before, "after": model_snapshot(entry)},
    )
    commit_or_409(db, "Journal entry void violates a constraint")
    db.refresh(entry)
    return entry


@router.post(
    "/journal-entries/{entry_id}/corrections",
    response_model=JournalEntryCorrectionRead,
    status_code=status.HTTP_201_CREATED,
    tags=["journal-entries"],
)
def correct_journal_entry(
    entry_id: int,
    payload: JournalEntryCorrectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_house_user),
) -> JournalEntryCorrectionRead:
    actor_id = current_user.id
    original = db.scalar(
        select(JournalEntry).where(JournalEntry.id == entry_id).with_for_update()
    )
    if not original:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )
    ensure_not_voided(original, "Journal entry")
    original_before = model_snapshot(original)

    apply_journal_effect(db, journal_effect_from_model(original), multiplier=-1)
    original.voided_at = datetime.now(UTC)
    original.voided_by_user_id = actor_id
    original.void_reason = payload.correction_reason
    original.updated_by_user_id = actor_id

    correction_data = payload.model_dump(exclude={"correction_reason"}, exclude_none=True)
    correction = JournalEntry(**correction_data, created_by_user_id=actor_id)
    apply_journal_effect(db, journal_effect_from_model(correction), multiplier=1)
    db.add(correction)
    flush_or_409(db, "Journal entry correction violates a constraint")
    log_event(
        db,
        event_type="journal_entry.corrected",
        entity_type="journal_entry",
        entity_id=original.id,
        actor_user_id=actor_id,
        details={
            "reason": payload.correction_reason,
            "voided_before": original_before,
            "voided_after": model_snapshot(original),
            "correction": model_snapshot(correction),
        },
    )

    commit_or_409(db, "Journal entry correction violates a constraint")
    db.refresh(original)
    db.refresh(correction)
    return JournalEntryCorrectionRead(voided_record=original, correction_record=correction)


@router.get("/event-logs", response_model=list[EventLogRead], tags=["audit"])
def list_event_logs(
    event_type: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_user_id: int | None = None,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
) -> list[EventLog]:
    skip, limit = page
    stmt = select(EventLog)
    if event_type is not None:
        stmt = stmt.where(EventLog.event_type == event_type)
    if entity_type is not None:
        stmt = stmt.where(EventLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(EventLog.entity_id == entity_id)
    if actor_user_id is not None:
        stmt = stmt.where(EventLog.actor_user_id == actor_user_id)
    stmt = stmt.order_by(EventLog.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def wallet_position(balance: Decimal) -> Literal[
    "client_owes_house",
    "house_owes_client",
    "settled",
]:
    if balance > 0:
        return "client_owes_house"
    if balance < 0:
        return "house_owes_client"
    return "settled"


@router.get(
    "/reports/client-balances",
    response_model=list[ClientBalanceReport],
    tags=["reports"],
)
def client_balances_report(
    direction: BalanceDirection = Query(default="all"),
    client_id: int | None = None,
    currency_id: str | None = None,
    include_zero: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[ClientBalanceReport]:
    stmt = (
        select(Wallet, User, Currency)
        .join(User, Wallet.user_id == User.id)
        .join(Currency, Wallet.currency_id == Currency.ticker)
        .where(User.role == UserRole.CLIENT)
    )
    if client_id is not None:
        stmt = stmt.where(User.id == client_id)
    if currency_id is not None:
        stmt = stmt.where(Wallet.currency_id == normalize_ticker(currency_id))

    if direction == "client_owes":
        stmt = stmt.where(Wallet.balance > 0)
    elif direction == "house_owes":
        stmt = stmt.where(Wallet.balance < 0)
    elif direction == "settled":
        stmt = stmt.where(Wallet.balance == 0)
    elif not include_zero:
        stmt = stmt.where(Wallet.balance != 0)

    stmt = stmt.order_by(User.username, Wallet.currency_id)
    rows = db.execute(stmt).all()
    return [
        ClientBalanceReport(
            client_id=user.id,
            username=user.username,
            name=user.name,
            surname=user.surname,
            currency_id=wallet.currency_id,
            currency_name=currency.name,
            balance=wallet.balance,
            position=wallet_position(wallet.balance),
        )
        for wallet, user, currency in rows
    ]


@router.get(
    "/reports/client-debts",
    response_model=list[ClientBalanceReport],
    tags=["reports"],
)
def client_debts_report(
    client_id: int | None = None,
    currency_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[ClientBalanceReport]:
    return client_balances_report(
        direction="client_owes",
        client_id=client_id,
        currency_id=currency_id,
        include_zero=False,
        db=db,
    )


@router.get("/reports/client-statements/{user_id}.xlsx", tags=["reports"])
def client_statement_export(
    user_id: int,
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Start date must be before end date",
        )

    user = get_user_or_404(db, user_id)
    wallets = list(
        db.scalars(
            select(Wallet)
            .where(Wallet.user_id == user_id)
            .order_by(Wallet.user_id, Wallet.currency_id)
        ).all()
    )
    wallet_ids = {wallet.id for wallet in wallets}
    orders = [
        order
        for order in db.scalars(
            select(Order).where(Order.client_id == user_id).order_by(Order.id.desc())
        ).all()
        if from_date.isoformat() <= date_key(order.created_at) <= to_date.isoformat()
    ]

    if wallet_ids:
        journals = [
            entry
            for entry in db.scalars(
                select(JournalEntry)
                .where(
                    (JournalEntry.from_wallet_id.in_(wallet_ids))
                    | (JournalEntry.to_wallet_id.in_(wallet_ids))
                )
                .order_by(JournalEntry.id.desc())
            ).all()
            if from_date.isoformat() <= date_key(entry.created_at) <= to_date.isoformat()
        ]
    else:
        journals = []

    currencies = list(db.scalars(select(Currency).order_by(Currency.ticker)).all())
    content, filename = build_client_statement_xlsx(
        user=user,
        wallets=wallets,
        currencies=currencies,
        orders=orders,
        journals=journals,
        user_wallet_ids=wallet_ids,
        from_date=from_date,
        to_date=to_date,
    )
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
