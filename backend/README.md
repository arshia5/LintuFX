# FX Ledger API

FastAPI backend for tracking client FX obligations and actual settlement money movements.

## Setup

1. Copy `.env.example` to `.env` and set PostgreSQL connection values.
   Set `JWT_SECRET_KEY` to a strong random value before deployment:

```bash
openssl rand -hex 32
```

2. Install dependencies:

```bash
./venv/bin/pip install -r requirements.txt
```

3. Run migrations:

```bash
./venv/bin/alembic upgrade head
```

4. Start the API:

```bash
./venv/bin/uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the interactive API docs.

## CORS

Set browser frontend origins in `.env`:

```env
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://192.168.1.10:3000
```

CORS origins must include scheme and port. Bare IPs are not enough for browser preflight checks.

If `CORS_ALLOWED_ORIGINS` is empty and `ALLOWED_IPS` contains bare hosts/IPs, the app will allow `http` and `https` origins from those hosts on any port.

## Authentication

All ledger endpoints require a Bearer token for a staff user (`HOUSE` or `DEVELOPER`). Ledger mutations remain `HOUSE`-only, while developer-only admin actions such as fresh start require `DEVELOPER`. Root, health, OpenAPI, and `/auth/login` are public.

Create a `HOUSE` user with a password, then log in:

```bash
curl -X POST http://127.0.0.1:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"house_user","password":"your-password"}'
```

Use the returned token:

```bash
curl http://127.0.0.1:8000/users \
  -H "Authorization: Bearer $TOKEN"
```

`CLIENT` users cannot log in. `HOUSE` users cannot create or promote users to `DEVELOPER`; only existing `DEVELOPER` users can do that.

Bootstrap the first developer account from the backend host:

```bash
./venv/bin/python scripts/upsert_developer_user.py developer_user --name Developer
```

The API only accepts plain `password` when creating or updating users. Raw `password_hash` input is rejected.

## Accounting Rules

- Orders create obligations only.
- Journal entries record actual movement between wallets.
- Posted orders, journal entries, and house exchanges are append-only.
- Use `POST /.../{id}/void` to reverse a posted record.
- Use `POST /.../{id}/corrections` to void a posted record and create a corrected replacement.
- Direct `PATCH` and `DELETE` for posted ledger records return `405`.
- `order_type` is a readability label only. It does not control accounting.
- Order balance effect is always:
  - client `currency_in_id` wallet increases by `amount_in`
  - client `currency_out_id` wallet decreases by `amount_out`
- Journal entry effect is always:
  - `from_wallet_id` balance decreases by `amount`
  - `to_wallet_id` balance increases by `amount`
- Journal entries validate that both wallets use the same currency as `currency_id`.
- House exchanges are house-only treasury exchanges:
  - house `currency_from_id` wallet decreases by `amount_from`
  - house `currency_to_id` wallet increases by `amount_to`

Client wallet meaning:

- Positive balance means the client owes the house.
- Negative balance means the house owes the client.

House wallet meaning:

- Positive balance means the house holds or is credited that currency.
- Negative balance means the house is short or owes that currency.

## Main Endpoints

- `/currencies`
- `/users`
- `/wallets`
- `/wallet-adjustments`
- `/event-logs`
- `/orders`
- `/house-exchanges`
- `/journal-entries`
- `/reports/client-balances`
- `/reports/client-debts`

Append-only endpoints:

- `POST /wallets/{wallet_id}/balance-adjustments`
- `POST /orders/{order_id}/void`
- `POST /orders/{order_id}/corrections`
- `POST /house-exchanges/{exchange_id}/void`
- `POST /house-exchanges/{exchange_id}/corrections`
- `POST /journal-entries/{entry_id}/void`
- `POST /journal-entries/{entry_id}/corrections`

Orders and journal entries accept an optional `created_at` timestamp. If omitted, PostgreSQL sets the current timestamp.

Event logs record successful mutations and authentication attempts with actor, entity, before/after snapshots where applicable, and request details with password hashes redacted.

Wallet balance adjustments:

- Direct `PATCH /wallets/{wallet_id}` is blocked.
- Use `POST /wallets/{wallet_id}/balance-adjustments`.
- Request body accepts exactly one of `balance_after` or `amount_delta`, plus `reason`.
- Each adjustment stores `balance_before`, `balance_after`, `amount_delta`, `reason`, `created_by_user_id`, and `created_at`.
