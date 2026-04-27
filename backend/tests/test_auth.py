from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.config import settings
from app.core.database import Base
from app.core.security import create_access_token, decode_access_token, hash_password
from app.main import app
from app.models import RefreshToken, User


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


def create_password_user(username: str, password: str = "S3cret-pass!", role: str = "user") -> User:
    db = TestingSessionLocal()
    try:
        user = User(
            username=username,
            email=f"{username}@example.test",
            display_name=username,
            role=role,
            password_hash=hash_password(password),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def clear_client_cookies() -> None:
    client.cookies.clear()


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


def test_login_success_sets_refresh_cookie_and_returns_access_token():
    clear_client_cookies()
    create_password_user("formal-login-success")

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "formal-login-success", "password": "S3cret-pass!"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    data = payload["data"]
    assert data["token_type"] == "Bearer"
    assert data["expires_in"] == settings.access_token_expires_seconds
    assert data["user"]["username"] == "formal-login-success"
    assert isinstance(data["access_token"], str)
    assert settings.REFRESH_TOKEN_COOKIE_NAME in response.cookies

    db = TestingSessionLocal()
    try:
        sessions = db.query(RefreshToken).join(User).filter(User.username == "formal-login-success").all()
        assert len(sessions) == 1
        assert sessions[0].token_hash != response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME]
        assert sessions[0].revoked_at is None
    finally:
        db.close()


def test_login_rejects_wrong_password():
    clear_client_cookies()
    create_password_user("formal-login-wrong-password")

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "formal-login-wrong-password", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {
        "code": 40101,
        "message": "invalid username or password",
        "data": None,
    }


def test_refresh_success_rotates_refresh_token():
    clear_client_cookies()
    create_password_user("formal-refresh-rotate")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "formal-refresh-rotate", "password": "S3cret-pass!"},
    )
    original_cookie = login_response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME]

    refresh_response = client.post("/api/v1/auth/refresh")

    assert refresh_response.status_code == 200
    assert refresh_response.json()["code"] == 0
    rotated_cookie = refresh_response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME]
    assert rotated_cookie != original_cookie
    payload = decode_access_token(refresh_response.json()["data"]["access_token"])
    assert payload["sub"] == "formal-refresh-rotate"
    assert isinstance(payload.get("session_id"), str)

    db = TestingSessionLocal()
    try:
        sessions = db.query(RefreshToken).join(User).filter(User.username == "formal-refresh-rotate").all()
        assert len(sessions) == 2
        assert sum(1 for session in sessions if session.revoked_at is not None) == 1
        assert sum(1 for session in sessions if session.revoked_at is None) == 1
    finally:
        db.close()


def test_reused_or_revoked_refresh_token_fails():
    clear_client_cookies()
    create_password_user("formal-refresh-reuse")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "formal-refresh-reuse", "password": "S3cret-pass!"},
    )
    original_cookie = login_response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME]
    assert client.post("/api/v1/auth/refresh").status_code == 200

    clear_client_cookies()
    reuse_response = client.post(
        "/api/v1/auth/refresh",
        headers={"Cookie": f"{settings.REFRESH_TOKEN_COOKIE_NAME}={original_cookie}"},
    )

    assert reuse_response.status_code == 401
    assert reuse_response.json() == {
        "code": 40101,
        "message": "refresh token invalid or expired",
        "data": None,
    }


def test_logout_revokes_current_refresh_token():
    clear_client_cookies()
    create_password_user("formal-logout")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "formal-logout", "password": "S3cret-pass!"},
    )
    refresh_cookie = login_response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME]

    logout_response = client.post("/api/v1/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json()["data"] == {"logged_out": True}

    clear_client_cookies()
    refresh_response = client.post(
        "/api/v1/auth/refresh",
        headers={"Cookie": f"{settings.REFRESH_TOKEN_COOKIE_NAME}={refresh_cookie}"},
    )
    assert refresh_response.status_code == 401


def test_me_rejects_without_token():
    clear_client_cookies()
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json() == {
        "code": 40101,
        "message": "authentication required",
        "data": None,
    }


def test_me_accepts_valid_access_token():
    clear_client_cookies()
    create_password_user("formal-me")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "formal-me", "password": "S3cret-pass!"},
    )
    access_token = login_response.json()["data"]["access_token"]

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    assert payload["data"]["username"] == "formal-me"


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
