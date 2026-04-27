from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

import app.models  # noqa: F401
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password, verify_password
from app.models import User


DEFAULT_DEV_USERNAME = "platform-admin"
DEFAULT_DEV_PASSWORD = "webguard-dev-password"
DEFAULT_DEV_ROLE = "admin"


@dataclass(frozen=True)
class SeedUserConfig:
    username: str
    password: str
    role: str
    email: str | None
    display_name: str
    used_default_password: bool


@dataclass(frozen=True)
class SeedUserResult:
    username: str
    role: str
    email: str | None
    created: bool
    password_updated: bool


def load_seed_config(env: Mapping[str, str] | None = None, *, allow_dev_defaults: bool | None = None) -> SeedUserConfig:
    values = env or os.environ
    defaults_allowed = settings.dev_auth_enabled if allow_dev_defaults is None else allow_dev_defaults

    username = values.get("WEBGUARD_SEED_USERNAME", DEFAULT_DEV_USERNAME if defaults_allowed else "").strip()
    password = values.get("WEBGUARD_SEED_PASSWORD", DEFAULT_DEV_PASSWORD if defaults_allowed else "")
    role = values.get("WEBGUARD_SEED_ROLE", DEFAULT_DEV_ROLE if defaults_allowed else "user").strip()
    email = values.get("WEBGUARD_SEED_EMAIL")
    display_name = values.get("WEBGUARD_SEED_DISPLAY_NAME", username).strip()
    used_default_password = "WEBGUARD_SEED_PASSWORD" not in values

    if not username:
        raise ValueError("WEBGUARD_SEED_USERNAME is required")
    if not password:
        raise ValueError("WEBGUARD_SEED_PASSWORD is required")
    if used_default_password and not defaults_allowed:
        raise ValueError("WEBGUARD_SEED_PASSWORD must be set outside development auth mode")
    if role not in {"admin", "user"}:
        raise ValueError("WEBGUARD_SEED_ROLE must be 'admin' or 'user'")

    return SeedUserConfig(
        username=username,
        password=password,
        role=role,
        email=email.strip() if email and email.strip() else None,
        display_name=display_name or username,
        used_default_password=used_default_password,
    )


def seed_user(db, config: SeedUserConfig) -> SeedUserResult:
    user = db.query(User).filter(User.username == config.username).first()
    created = user is None
    password_updated = False

    if user is None:
        user = User(
            username=config.username,
            email=config.email,
            display_name=config.display_name,
            role=config.role,
            is_active=True,
        )
        db.add(user)
    else:
        if config.email:
            user.email = config.email
        user.display_name = config.display_name
        user.role = config.role
        user.is_active = True

    if not verify_password(config.password, user.password_hash):
        user.password_hash = hash_password(config.password)
        password_updated = True

    db.commit()
    db.refresh(user)
    return SeedUserResult(
        username=user.username,
        role=user.role,
        email=user.email,
        created=created,
        password_updated=password_updated,
    )


def main() -> int:
    try:
        config = load_seed_config()
    except ValueError as exc:
        print(f"Seed failed: {exc}")
        return 1

    db = SessionLocal()
    try:
        result = seed_user(db, config)
    finally:
        db.close()

    action = "created" if result.created else "updated"
    password_state = "password updated" if result.password_updated else "password unchanged"
    default_note = " using development default password" if config.used_default_password else ""
    print(
        f"Seed user {action}: username={result.username} role={result.role} "
        f"email={result.email or '-'} ({password_state}{default_note})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
