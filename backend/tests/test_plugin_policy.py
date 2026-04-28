import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.database import Base
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import User
from app.services.domain_service import DomainService


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def auth_headers(username: str = "policy-user", role: str = "user") -> dict[str, str]:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = User(
                username=username,
                email=f"{username}@example.test",
                display_name=username,
                role=role,
                password_hash=hash_password("S3cret-pass!"),
                is_active=True,
            )
            db.add(user)
        else:
            user.role = role
            user.is_active = True
        db.commit()
    finally:
        db.close()
    token = create_access_token(subject=username, role=role)
    return {"Authorization": f"Bearer {token}"}


def test_plugin_bootstrap_returns_strategy_snapshot(client: TestClient):
    headers = auth_headers("alice")

    client.post(
        "/api/v1/my/domains",
        headers=headers,
        json={"host": "trusted.example.com", "list_type": "trusted", "source": "manual", "reason": "user trust"},
    )
    client.post(
        "/api/v1/my/domains",
        headers=headers,
        json={"host": "blocked.example.com", "list_type": "blocked", "source": "manual", "reason": "user block"},
    )
    client.post(
        "/api/v1/my/domains",
        headers=headers,
        json={"host": "paused.example.com", "list_type": "temp_bypass", "source": "plugin", "minutes": 45},
    )

    db = TestingSessionLocal()
    try:
        DomainService(db).create_domain(
            owner_type="global",
            username=None,
            data={"host": "global-trusted.example.com", "list_type": "trusted", "source": "system", "reason": "global trust"},
        )
        DomainService(db).create_domain(
            owner_type="global",
            username=None,
            data={"host": "global-blocked.example.com", "list_type": "blocked", "source": "system", "reason": "global block"},
        )
    finally:
        db.close()

    response = client.get("/api/v1/plugin/bootstrap", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    data = payload["data"]

    assert "trusted.example.com" in data["trusted_hosts"]
    assert "global-trusted.example.com" in data["trusted_hosts"]
    assert "blocked.example.com" in data["blocked_hosts"]
    assert "global-blocked.example.com" in data["blocked_hosts"]
    assert data["whitelist_domains"]["user"] == ["trusted.example.com"]
    assert "global-trusted.example.com" in data["whitelist_domains"]["global"]
    assert "blocked.example.com" in data["blacklist_domains"]["user"]
    assert "global-blocked.example.com" in data["blacklist_domains"]["global"]
    assert any(item["domain"] == "paused.example.com" for item in data["temp_bypass_records"])
    assert any(item["domain"] == "paused.example.com" for item in data["temporary_trusted_domains"])
    assert isinstance(data["policy_version"], str) and data["policy_version"].startswith("policy-")
    assert isinstance(data["config_version"], str) and data["config_version"]
    assert isinstance(data["current_rule_version"], str) and data["current_rule_version"]
    assert data["updated_at"]
    assert data["generated_at"]


def test_trusted_domain_policy_allows_scan(client: TestClient):
    headers = auth_headers("trusted-user")
    client.post(
        "/api/v1/my/domains",
        headers=headers,
        json={"host": "trusted.example.com", "list_type": "trusted", "source": "plugin", "reason": "safe override"},
    )

    response = client.post("/api/v1/scan/url", headers=headers, json={"url": "https://trusted.example.com/login"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    assert payload["data"]["label"] == "safe"
    assert payload["data"]["action"] == "ALLOW"
    assert payload["data"]["should_block"] is False


def test_blocked_domain_policy_blocks_scan(client: TestClient):
    headers = auth_headers("blocked-user")
    client.post(
        "/api/v1/my/domains",
        headers=headers,
        json={"host": "blocked.example.com", "list_type": "blocked", "source": "plugin", "reason": "user blocked"},
    )

    response = client.post("/api/v1/scan/url", headers=headers, json={"url": "https://blocked.example.com/login"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    assert payload["data"]["label"] == "malicious"
    assert payload["data"]["action"] == "BLOCK"
    assert payload["data"]["should_warn"] is True
    assert payload["data"]["should_block"] is True


def test_temp_bypass_write_can_be_read_back_from_bootstrap(client: TestClient):
    headers = auth_headers("paused-user")
    response = client.post(
        "/api/v1/my/domains",
        headers=headers,
        json={"host": "pause-me.example.com", "list_type": "temp_bypass", "source": "plugin", "minutes": 15},
    )
    assert response.status_code == 200
    item = response.json()["data"]
    assert item["list_type"] == "temp_bypass"
    assert item["expires_at"]

    bootstrap = client.get("/api/v1/plugin/bootstrap", headers=headers)
    assert bootstrap.status_code == 200
    data = bootstrap.json()["data"]
    paused = next(entry for entry in data["temp_bypass_records"] if entry["domain"] == "pause-me.example.com")
    assert paused["expires_at"]
