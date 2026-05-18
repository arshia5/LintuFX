from __future__ import annotations

import argparse
from getpass import getpass
import os
from pathlib import Path
import sys

from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

from app.database import SessionLocal
from app.models import User, UserRole
from app.security import hash_password, verify_password
from app.services import log_event, model_snapshot


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a DEVELOPER user or reset an existing DEVELOPER password."
    )
    parser.add_argument("username", help="Developer username")
    parser.add_argument("--name", help="First name. Defaults to username.")
    parser.add_argument("--surname", help="Last name")
    parser.add_argument(
        "--password",
        help="Password. If omitted, the script prompts without echoing input.",
    )
    return parser.parse_args()


def prompt_password() -> str:
    password = getpass("Password: ")
    confirmation = getpass("Confirm password: ")
    if password != confirmation:
        raise ValueError("Passwords do not match.")
    return password


def main() -> int:
    args = parse_args()
    password = args.password if args.password is not None else prompt_password()
    if not password:
        raise ValueError("Password cannot be empty.")

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username))
        if user is not None and user.role != UserRole.DEVELOPER:
            raise PermissionError(
                f"User {args.username!r} has role {user.role.value}; refusing to promote it."
            )

        if user is None:
            user = User(
                role=UserRole.DEVELOPER,
                username=args.username,
                name=args.name or args.username,
                surname=args.surname,
                password_hash=hash_password(password),
            )
            db.add(user)
            db.flush()
            event_type = "user.developer_created"
            before = None
        else:
            before = model_snapshot(user)
            user.name = args.name or user.name
            if args.surname is not None:
                user.surname = args.surname
            user.password_hash = hash_password(password)
            event_type = "user.developer_password_reset"

        after = model_snapshot(user)
        log_event(
            db,
            event_type=event_type,
            entity_type="user",
            entity_id=user.id,
            actor_user_id=user.id,
            details={
                "username": user.username,
                "before": before,
                "after": after,
                "source": "scripts/upsert_developer_user.py",
            },
        )
        db.commit()
        db.refresh(user)

        if not verify_password(password, user.password_hash):
            raise RuntimeError("Password was saved, but verification failed.")

    print(f"Developer user {args.username!r} is ready.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
