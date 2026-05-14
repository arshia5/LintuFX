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
        description="Reset the password for an existing HOUSE user."
    )
    parser.add_argument("username", help="Username of the HOUSE user to update")
    parser.add_argument(
        "--password",
        help="New password. If omitted, the script prompts without echoing input.",
    )
    return parser.parse_args()


def prompt_password() -> str:
    password = getpass("New password: ")
    confirmation = getpass("Confirm new password: ")
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
        if user is None:
            raise LookupError(f"User {args.username!r} was not found.")
        if user.role != UserRole.HOUSE:
            raise PermissionError(
                f"User {args.username!r} has role {user.role.value}; only HOUSE users can log in."
            )

        before = model_snapshot(user)
        user.password_hash = hash_password(password)
        after = model_snapshot(user)
        log_event(
            db,
            event_type="user.password_reset",
            entity_type="user",
            entity_id=user.id,
            actor_user_id=user.id,
            details={
                "username": user.username,
                "before": before,
                "after": after,
                "source": "scripts/reset_house_password.py",
            },
        )
        db.commit()
        db.refresh(user)

        if not verify_password(password, user.password_hash):
            raise RuntimeError("Password was updated, but verification failed.")

    print(f"Password reset for HOUSE user {args.username!r}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
