from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.config import settings
from app.core.database import Base
from app.core.security import create_access_token, decode_access_token
from app.main import app


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


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_create_and_decode_access_token():
    token = create_access_token(subject="alice", role="admin")
    payload = decode_access_token(token)
    assert payload["sub"] == "alice"
    assert payload["role"] == "admin"
    assert payload["type"] == "access"


def test_mock_login_available_in_dev(monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "ENABLE_DEV_AUTH", True)
    response = client.post("/api/v1/auth/mock-login", json={"username": "alice", "role": "user"})
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert data["data"]["username"] == "alice"
    assert data["data"]["token_type"] == "Bearer"
    assert isinstance(data["data"]["access_token"], str)
    payload = decode_access_token(data["data"]["access_token"])
    assert payload["sub"] == "alice"
    assert payload["role"] == "user"


def test_mock_login_disabled_outside_dev(monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "ENABLE_DEV_AUTH", True)
    response = client.post("/api/v1/auth/mock-login", json={"username": "alice", "role": "user"})
    assert response.status_code == 403
    assert response.json() == {
        "code": 40301,
        "message": "mock login is disabled",
        "data": None,
    }


def test_require_auth_rejects_without_token(monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "ENABLE_DEV_AUTH", True)
    response = client.get("/api/v1/my/policy")
    assert response.status_code == 401
    assert response.json() == {
        "code": 40101,
        "message": "authentication required",
        "data": None,
    }


def test_require_auth_accepts_valid_token(monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "ENABLE_DEV_AUTH", True)
    token = create_access_token(subject="token-user", role="user")
    response = client.get("/api/v1/my/policy", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert data["data"]["username"] == "token-user"


def test_dev_headers_allowed_for_protected_route_in_dev(monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "ENABLE_DEV_AUTH", True)
    response = client.get(
        "/api/v1/plugin/bootstrap",
        headers={"X-WebGuard-User": "plugin-dev-user", "X-WebGuard-Role": "user"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "user_policy" in data["data"]


def test_dev_headers_rejected_for_protected_route_outside_dev(monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "ENABLE_DEV_AUTH", True)
    response = client.get(
        "/api/v1/plugin/bootstrap",
        headers={"X-WebGuard-User": "plugin-dev-user", "X-WebGuard-Role": "user"},
    )
    assert response.status_code == 401
    assert response.json() == {
        "code": 40101,
        "message": "authentication required",
        "data": None,
    }
