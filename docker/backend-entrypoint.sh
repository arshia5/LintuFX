#!/bin/sh
set -eu

python - <<'PY'
import time

from sqlalchemy import create_engine, text

from app.config import get_settings

database_url = get_settings().sqlalchemy_database_url

for attempt in range(60):
    try:
        engine = create_engine(database_url, pool_pre_ping=True)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        print("Database is ready.")
        break
    except Exception as exc:
        if attempt == 59:
            raise
        print(f"Database is not ready yet: {exc}")
        time.sleep(2)
PY

alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
