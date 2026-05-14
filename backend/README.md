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

## Docker

The Docker setup starts two services:

- `db`: PostgreSQL with a persistent Docker volume.
- `api`: FastAPI app. On every start it waits for PostgreSQL, runs `alembic upgrade head`, then starts Uvicorn.

1. Prepare environment values:

```bash
cp .env.docker.example .env
```

If you already have a `.env`, merge the Docker values instead of replacing it.

Set strong production values before deployment:

```bash
openssl rand -hex 32
```

Use that output for `JWT_SECRET_KEY`, and set a strong `DB_PASSWORD`.

2. Start the stack:

```bash
docker compose up --build -d
```

3. View logs:

```bash
docker compose logs -f api
```

4. Stop the stack:

```bash
docker compose down
```

The database data remains in the `postgres_data` Docker volume. To delete the database volume too:

```bash
docker compose down -v
```

If you change `DB_NAME`, `DB_USERNAME`, or `DB_PASSWORD` after PostgreSQL has already initialized, recreate the database volume or update the PostgreSQL user manually. The existing volume keeps the original database credentials.

By default the API is published on `127.0.0.1:8000`. Change `API_BIND` in `.env`:

```env
API_BIND=127.0.0.1
```

Use `127.0.0.1` for local-only access, `0.0.0.0` for all network interfaces, or your VPS Tailscale IP if you want the API reachable only through Tailscale.

For browser frontends, set the frontend origin exactly:

```env
CORS_ALLOWED_ORIGINS=http://100.64.10.20:5173
```

If you also use the request source IP allowlist, set `ALLOWED_IPS` to the allowed Tailscale/source IPs.

## CORS

Set browser frontend origins in `.env`:

```env
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://192.168.1.10:3000
```

CORS origins must include scheme and port. Bare IPs are not enough for browser preflight checks.

If `CORS_ALLOWED_ORIGINS` is empty and `ALLOWED_IPS` contains bare hosts/IPs, the app will allow `http` and `https` origins from those hosts on any port.

## Authentication

All ledger endpoints require a Bearer token for a `HOUSE` user. Root, health, OpenAPI, and `/auth/login` are public.

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

`CLIENT` users cannot log in.

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
