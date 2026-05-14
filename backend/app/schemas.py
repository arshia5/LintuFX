from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import OrderType, UserRole


Money = Annotated[Decimal, Field(max_digits=18, decimal_places=4)]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=4)]
PositiveRate = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=8)]


def normalize_ticker(value: str) -> str:
    return value.strip().upper()


class SchemaBase(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        extra="forbid",
    )


class LoginRequest(SchemaBase):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=255)


class TokenRead(SchemaBase):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class FreshStartRequest(SchemaBase):
    confirm: Literal["FRESH_START"]


class FreshStartRead(SchemaBase):
    deleted: dict[str, int]
    preserved_house_users: int


class CurrencyBase(SchemaBase):
    name: str = Field(min_length=1, max_length=80)
    symbol: str | None = Field(default=None, max_length=10)
    decimals: int = Field(default=4, ge=0, le=18)
    is_active: bool = True


class CurrencyCreate(CurrencyBase):
    ticker: str = Field(min_length=1, max_length=12)

    @field_validator("ticker")
    @classmethod
    def uppercase_ticker(cls, value: str) -> str:
        return normalize_ticker(value)


class CurrencyUpdate(SchemaBase):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    symbol: str | None = Field(default=None, max_length=10)
    decimals: int | None = Field(default=None, ge=0, le=18)
    is_active: bool | None = None


class CurrencyRead(CurrencyBase):
    ticker: str
    created_at: datetime


class UserBase(SchemaBase):
    role: UserRole
    username: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    surname: str | None = Field(default=None, max_length=120)


class UserCreate(UserBase):
    password: str | None = Field(default=None, min_length=1, max_length=255)


class UserUpdate(SchemaBase):
    role: UserRole | None = None
    username: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    surname: str | None = Field(default=None, max_length=120)
    password: str | None = Field(default=None, min_length=1, max_length=255)


class UserRead(UserBase):
    id: int
    created_at: datetime


class WalletBase(SchemaBase):
    user_id: int
    currency_id: str = Field(min_length=1, max_length=12)

    @field_validator("currency_id")
    @classmethod
    def uppercase_currency_id(cls, value: str) -> str:
        return normalize_ticker(value)


class WalletCreate(WalletBase):
    balance: Money = Decimal("0")


class WalletRead(WalletBase):
    id: int
    balance: Money
    created_at: datetime


class WalletBalanceAdjustmentCreate(SchemaBase):
    balance_after: Money | None = None
    amount_delta: Money | None = None
    reason: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def exactly_one_adjustment_mode(self) -> "WalletBalanceAdjustmentCreate":
        if (self.balance_after is None) == (self.amount_delta is None):
            raise ValueError("Use exactly one of balance_after or amount_delta")
        return self


class WalletAdjustmentRead(SchemaBase):
    id: int
    wallet_id: int
    currency_id: str
    balance_before: Money
    balance_after: Money
    amount_delta: Money
    reason: str
    created_by_user_id: int
    created_at: datetime


class LedgerAuditRead(SchemaBase):
    created_by_user_id: int | None = None
    updated_by_user_id: int | None = None
    voided_at: datetime | None = None
    voided_by_user_id: int | None = None
    void_reason: str | None = None


class VoidRequest(SchemaBase):
    reason: str = Field(min_length=1, max_length=1000)


class OrderBase(SchemaBase):
    client_id: int
    order_type: OrderType
    currency_in_id: str = Field(min_length=1, max_length=12)
    currency_out_id: str = Field(min_length=1, max_length=12)
    amount_in: PositiveMoney
    amount_out: PositiveMoney
    exchange_rate: PositiveRate
    description: str | None = None

    @field_validator("currency_in_id", "currency_out_id")
    @classmethod
    def uppercase_order_currency(cls, value: str) -> str:
        return normalize_ticker(value)


class OrderCreate(OrderBase):
    created_at: datetime | None = None


class OrderUpdate(SchemaBase):
    client_id: int | None = None
    order_type: OrderType | None = None
    currency_in_id: str | None = Field(default=None, min_length=1, max_length=12)
    currency_out_id: str | None = Field(default=None, min_length=1, max_length=12)
    amount_in: PositiveMoney | None = None
    amount_out: PositiveMoney | None = None
    exchange_rate: PositiveRate | None = None
    description: str | None = None

    @field_validator("currency_in_id", "currency_out_id")
    @classmethod
    def uppercase_order_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_ticker(value)


class OrderRead(OrderBase):
    id: int
    created_at: datetime
    created_by_user_id: int | None = None
    updated_by_user_id: int | None = None
    voided_at: datetime | None = None
    voided_by_user_id: int | None = None
    void_reason: str | None = None


class OrderCorrectionCreate(OrderCreate):
    correction_reason: str = Field(min_length=1, max_length=1000)


class OrderCorrectionRead(SchemaBase):
    voided_record: OrderRead
    correction_record: OrderRead


class HouseExchangeBase(SchemaBase):
    house_id: int
    currency_from_id: str = Field(min_length=1, max_length=12)
    currency_to_id: str = Field(min_length=1, max_length=12)
    amount_from: PositiveMoney
    amount_to: PositiveMoney
    exchange_rate: PositiveRate
    description: str | None = None

    @field_validator("currency_from_id", "currency_to_id")
    @classmethod
    def uppercase_house_exchange_currency(cls, value: str) -> str:
        return normalize_ticker(value)


class HouseExchangeCreate(HouseExchangeBase):
    pass


class HouseExchangeUpdate(SchemaBase):
    house_id: int | None = None
    currency_from_id: str | None = Field(default=None, min_length=1, max_length=12)
    currency_to_id: str | None = Field(default=None, min_length=1, max_length=12)
    amount_from: PositiveMoney | None = None
    amount_to: PositiveMoney | None = None
    exchange_rate: PositiveRate | None = None
    description: str | None = None

    @field_validator("currency_from_id", "currency_to_id")
    @classmethod
    def uppercase_house_exchange_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_ticker(value)


class HouseExchangeRead(HouseExchangeBase):
    id: int
    created_at: datetime
    created_by_user_id: int | None = None
    updated_by_user_id: int | None = None
    voided_at: datetime | None = None
    voided_by_user_id: int | None = None
    void_reason: str | None = None


class HouseExchangeCorrectionCreate(HouseExchangeCreate):
    correction_reason: str = Field(min_length=1, max_length=1000)


class HouseExchangeCorrectionRead(SchemaBase):
    voided_record: HouseExchangeRead
    correction_record: HouseExchangeRead


class JournalEntryBase(SchemaBase):
    from_wallet_id: int
    to_wallet_id: int
    amount: PositiveMoney
    currency_id: str = Field(min_length=1, max_length=12)
    description: str | None = None

    @field_validator("currency_id")
    @classmethod
    def uppercase_journal_currency(cls, value: str) -> str:
        return normalize_ticker(value)


class JournalEntryCreate(JournalEntryBase):
    created_at: datetime | None = None


class JournalEntryUpdate(SchemaBase):
    from_wallet_id: int | None = None
    to_wallet_id: int | None = None
    amount: PositiveMoney | None = None
    currency_id: str | None = Field(default=None, min_length=1, max_length=12)
    description: str | None = None

    @field_validator("currency_id")
    @classmethod
    def uppercase_journal_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_ticker(value)


class JournalEntryRead(JournalEntryBase):
    id: int
    created_at: datetime
    created_by_user_id: int | None = None
    updated_by_user_id: int | None = None
    voided_at: datetime | None = None
    voided_by_user_id: int | None = None
    void_reason: str | None = None


class JournalEntryCorrectionCreate(JournalEntryCreate):
    correction_reason: str = Field(min_length=1, max_length=1000)


class JournalEntryCorrectionRead(SchemaBase):
    voided_record: JournalEntryRead
    correction_record: JournalEntryRead


BalanceDirection = Literal["all", "client_owes", "house_owes", "settled"]


class ClientBalanceReport(SchemaBase):
    client_id: int
    username: str
    name: str
    surname: str | None
    currency_id: str
    currency_name: str
    balance: Money
    position: Literal["client_owes_house", "house_owes_client", "settled"]


class EventLogRead(SchemaBase):
    id: int
    event_type: str
    entity_type: str
    entity_id: int | None
    actor_user_id: int | None
    details: dict
    created_at: datetime
