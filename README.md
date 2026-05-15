# Lintu Exchange

Small FX ledger app for managing clients, wallets, currency orders, house exchanges, journal entries, and balance reports.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS
- Backend: FastAPI, SQLAlchemy, Alembic
- Database: PostgreSQL

## Local Development

Start the backend:

```bash
cd backend
./venv/bin/pip install -r requirements.txt
./venv/bin/alembic upgrade head
./venv/bin/uvicorn app.main:app --reload
```

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Default URLs:

- Frontend: `http://127.0.0.1:5173`
- API docs: `http://127.0.0.1:8000/docs`

## Configuration

Copy the example env files before running:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set the backend database connection and JWT secret in `backend/.env`. Set `VITE_API_URL` in `frontend/.env` if the API is not available at the default URL.

## Docker

The Docker setup runs:

- `web`: Nginx serving the frontend and proxying `/api/*`
- `api`: FastAPI backend with migrations run on startup

It expects PostgreSQL to run outside this compose file.

```bash
cd docker
cp .env.example .env
```

Edit `docker/.env` with the PostgreSQL connection, JWT secret, and public browser origin. Then start the app:

```bash
docker compose -f compose.yml up --build -d
```

Useful commands:

```bash
docker compose -f compose.yml logs -f
docker compose -f compose.yml down
```

See [docker/README.md](docker/README.md) for full Docker deployment notes.

More backend details, accounting rules, and API endpoint notes are in [backend/README.md](backend/README.md).
