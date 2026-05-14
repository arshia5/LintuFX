# Docker Deployment

This Docker setup runs:

- `web`: Nginx serving the frontend and proxying `/api/*` to the backend.
- `api`: FastAPI backend, which runs migrations on startup.

It does not run PostgreSQL. Point the backend at your existing PostgreSQL VPS over Tailscale.

## Setup

1. Install and connect Tailscale on the Docker VPS.

2. Copy the Docker environment template:

```bash
cd docker
cp .env.example .env
```

3. Edit `docker/.env`.

Set `DB_HOST` to the PostgreSQL server's Tailscale IP, for example:

```env
DB_HOST=100.x.y.z
DB_NAME=fx_ledger
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-password
```

Set `CORS_ALLOWED_ORIGINS` to the browser URL for the Docker VPS:

```env
CORS_ALLOWED_ORIGINS=http://YOUR_DOCKER_VPS_IP
```

4. Start the app:

```bash
docker compose -f compose.yml up --build -d
```

5. View logs:

```bash
docker compose -f compose.yml logs -f
```

6. Stop:

```bash
docker compose -f compose.yml down
```

## Notes

- The frontend calls `/api`, so the browser only needs access to the `web` container.
- The backend container must be able to reach the database Tailscale IP from the Docker VPS.
- PostgreSQL on the DB VPS must listen on the Tailscale interface or all interfaces, and its firewall/`pg_hba.conf` must allow the Docker VPS Tailscale address.
- Keep `ALLOWED_IPS` empty unless you know you need it. Behind Nginx, the backend sees the Docker web container as the direct client.
