from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.config import settings
from app.core.database import Base
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.main import app
from app.models import RefreshToken, User
from app.services.user_service import UserService


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    client.cookies.clear()
    settings.DEBUG = True
    settings.ENABLE_DEV_AUTH = True


def create_password_user(
    username: str,
    password: str = "S3cret-pass!",
    role: str = "user",
    *,
    is_active: bool = True,
) -> User:
    db = TestingSessionLocal()
    try:
        user = User(
            username=username,
            email=f"{username}@example.test",
            display_name=username,
            role=role,
            password_hash=hash_password(password),
            is_active=is_active,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def ensure_defaults() -> None:
    db = TestingSessionLocal()
    try:
        UserService(db).ensure_default_users()
        db.commit()
    finally:
        db.close()


def login(username: str, password: str) -> tuple[str, dict]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    data = response.json()["data"]
    return data["access_token"], data


def admin_token() -> str:
    ensure_defaults()
    token, _ = login("admin", "admin")
    return token


def test_create_and_decode_access_token():
    token = create_access_token(subject="alice", role="admin")
    payload = decode_access_token(token)
    assert payload["sub"] == "alice"
    assert payload["role"] == "admin"
    assert payload["type"] == "access"


def test_default_admin_user_exists_with_admin_role():
    ensure_defaults()
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.username == "admin").first()
        assert user is not None
        assert user.role == "admin"
        assert user.display_name == "系统管理员"
        assert user.is_active is True
        assert verify_password("admin", user.password_hash)
    finally:
        db.close()


def test_default_guest_user_exists_with_user_role():
    ensure_defaults()
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.username == "guest").first()
        assert user is not None
        assert user.role == "user"
        assert user.display_name == "访客用户"
        assert user.is_active is True
        assert verify_password("guest", user.password_hash)
    finally:
        db.close()


def test_admin_login_success_returns_admin_profile():
    token, data = login("admin", "admin")
    assert data["token_type"] == "Bearer"
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"
    assert data["user"]["is_active"] is True
    assert isinstance(token, str)


def test_guest_login_success_returns_user_profile():
    token, data = login("guest", "guest")
    assert data["user"]["username"] == "guest"
    assert data["user"]["role"] == "user"
    assert data["user"]["is_active"] is True
    assert isinstance(token, str)


def test_admin_wrong_password_login_fails():
    response = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["message"] == "invalid username or password"


def test_guest_wrong_password_login_fails():
    response = client.post("/api/v1/auth/login", json={"username": "guest", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["message"] == "invalid username or password"


def test_disabled_user_cannot_login():
    create_password_user("disabled-user", is_active=False)
    response = client.post("/api/v1/auth/login", json={"username": "disabled-user", "password": "S3cret-pass!"})
    assert response.status_code == 401


def test_refresh_returns_database_role():
    create_password_user("refresh-role", role="user")
    login("refresh-role", "S3cret-pass!")
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.username == "refresh-role").first()
        user.role = "admin"
        db.commit()
    finally:
        db.close()

    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert response.json()["data"]["user"]["role"] == "admin"


def test_logout_revokes_refresh_token():
    login("admin", "admin")
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 200
    assert response.json()["data"] == {"logged_out": True}

    db = TestingSessionLocal()
    try:
        sessions = db.query(RefreshToken).all()
        assert sessions
        assert all(session.revoked_at is not None for session in sessions)
    finally:
        db.close()

    refresh_response = client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 401


def test_mock_login_rejects_admin_as_user():
    response = client.post("/api/v1/auth/mock-login", json={"username": "admin", "role": "user"})
    assert response.status_code == 403


def test_mock_login_rejects_guest_as_admin():
    response = client.post("/api/v1/auth/mock-login", json={"username": "guest", "role": "admin"})
    assert response.status_code == 403


def test_mock_login_accepts_fixed_development_accounts():
    response = client.post("/api/v1/auth/mock-login", json={"username": "admin", "role": "admin"})
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "admin"

    response = client.post("/api/v1/auth/mock-login", json={"username": "guest", "role": "user"})
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "user"


def test_dev_header_cannot_forge_guest_admin():
    response = client.get(
        "/api/v1/admin/users",
        headers={"X-WebGuard-User": "guest", "X-WebGuard-Role": "admin"},
    )
    assert response.status_code == 403


def test_dev_header_cannot_forge_arbitrary_admin():
    response = client.get(
        "/api/v1/admin/users",
        headers={"X-WebGuard-User": "operator", "X-WebGuard-Role": "admin"},
    )
    assert response.status_code == 403


def test_mock_login_does_not_change_real_user_role():
    ensure_defaults()
    response = client.post("/api/v1/auth/mock-login", json={"username": "guest", "role": "admin"})
    assert response.status_code == 403

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.username == "guest").first()
        assert user.role == "user"
    finally:
        db.close()


def test_regular_user_cannot_access_admin_users():
    token, _ = login("guest", "guest")
    response = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_admin_can_create_user():
    token = admin_token()
    response = client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "created-user",
            "password": "new-pass",
            "email": "created@example.test",
            "display_name": "Created User",
            "role": "user",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["username"] == "created-user"


def test_admin_can_disable_regular_user():
    token = admin_token()
    user = create_password_user("disable-me")
    response = client.post(f"/api/v1/admin/users/{user.id}/disable", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False


def test_cannot_disable_or_delete_last_admin():
    token = admin_token()
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.username == "admin").first()
        admin_id = user.id
    finally:
        db.close()

    disable_response = client.post(f"/api/v1/admin/users/{admin_id}/disable", headers={"Authorization": f"Bearer {token}"})
    assert disable_response.status_code == 422

    delete_response = client.delete(f"/api/v1/admin/users/{admin_id}", headers={"Authorization": f"Bearer {token}"})
    assert delete_response.status_code == 422


def test_admin_can_reset_regular_user_password_and_old_password_fails():
    token = admin_token()
    user = create_password_user("reset-me", password="old-pass")
    response = client.post(
        f"/api/v1/admin/users/{user.id}/reset-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"password": "new-pass"},
    )
    assert response.status_code == 200

    client.cookies.clear()
    old_response = client.post("/api/v1/auth/login", json={"username": "reset-me", "password": "old-pass"})
    assert old_response.status_code == 401

    new_response = client.post("/api/v1/auth/login", json={"username": "reset-me", "password": "new-pass"})
    assert new_response.status_code == 200
