import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.database import Base
from app.core.security import verify_password
from app.models import User
from app.scripts.seed_dev_user import load_seed_config, seed_user


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_seed_dev_user_creates_formal_login_user(db):
    config = load_seed_config(
        {
            "WEBGUARD_SEED_USERNAME": "seed-admin",
            "WEBGUARD_SEED_PASSWORD": "local-secret",
            "WEBGUARD_SEED_ROLE": "admin",
            "WEBGUARD_SEED_EMAIL": "seed-admin@example.test",
            "WEBGUARD_SEED_DISPLAY_NAME": "Seed Admin",
        },
        allow_dev_defaults=False,
    )

    result = seed_user(db, config)

    assert result.created is True
    assert result.password_updated is True
    user = db.query(User).filter(User.username == "seed-admin").one()
    assert user.role == "admin"
    assert user.email == "seed-admin@example.test"
    assert user.display_name == "Seed Admin"
    assert verify_password("local-secret", user.password_hash)


def test_seed_dev_user_is_idempotent_and_updates_profile(db):
    first_config = load_seed_config(
        {
            "WEBGUARD_SEED_USERNAME": "seed-user",
            "WEBGUARD_SEED_PASSWORD": "local-secret",
            "WEBGUARD_SEED_ROLE": "user",
        },
        allow_dev_defaults=False,
    )
    second_config = load_seed_config(
        {
            "WEBGUARD_SEED_USERNAME": "seed-user",
            "WEBGUARD_SEED_PASSWORD": "local-secret",
            "WEBGUARD_SEED_ROLE": "admin",
            "WEBGUARD_SEED_EMAIL": "seed-user@example.test",
            "WEBGUARD_SEED_DISPLAY_NAME": "Promoted User",
        },
        allow_dev_defaults=False,
    )

    seed_user(db, first_config)
    result = seed_user(db, second_config)

    assert result.created is False
    assert result.password_updated is False
    assert db.query(User).filter(User.username == "seed-user").count() == 1
    user = db.query(User).filter(User.username == "seed-user").one()
    assert user.role == "admin"
    assert user.email == "seed-user@example.test"
    assert user.display_name == "Promoted User"


def test_seed_requires_explicit_password_outside_dev_defaults():
    with pytest.raises(ValueError, match="WEBGUARD_SEED_PASSWORD"):
        load_seed_config({"WEBGUARD_SEED_USERNAME": "prod-admin"}, allow_dev_defaults=False)
