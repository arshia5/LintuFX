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

## Deployment

Docker deployment files are in `docker/`. See [docker/README.md](docker/README.md) for the production container setup.

More backend details, accounting rules, and API endpoint notes are in [backend/README.md](backend/README.md).
