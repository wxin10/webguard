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
    settings.DEFAULT_ADMIN_PASSWORD = "admin"
    settings.DEFAULT_GUEST_PASSWORD = "guest"


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


def test_wrong_password_login_fails():
    ensure_defaults()
    for username in ["admin", "guest"]:
        response = client.post("/api/v1/auth/login", json={"username": username, "password": "wrong"})
        assert response.status_code == 401
        assert response.json()["message"] == "invalid username or password"


def test_disabled_user_cannot_login():
    create_password_user("disabled-user", is_active=False)
    response = client.post("/api/v1/auth/login", json={"username": "disabled-user", "password": "S3cret-pass!"})
    assert response.status_code == 401


def test_register_creates_regular_user():
    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "registered-user",
            "password": "register-pass",
            "email": "registered@example.test",
            "display_name": "Registered User",
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["username"] == "registered-user"
    assert data["email"] == "registered@example.test"
    assert data["display_name"] == "Registered User"
    assert data["role"] == "user"


def test_registered_password_is_hashed():
    password = "register-pass"
    response = client.post("/api/v1/auth/register", json={"username": "hash-user", "password": password})
    assert response.status_code == 200

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.username == "hash-user").first()
        assert user.password_hash != password
        assert verify_password(password, user.password_hash)
    finally:
        db.close()


def test_register_rejects_admin_role_field():
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "role-user", "password": "register-pass", "role": "admin"},
    )
    assert response.status_code == 400


def test_register_rejects_admin_username():
    response = client.post("/api/v1/auth/register", json={"username": "admin", "password": "register-pass"})
    assert response.status_code == 422


def test_register_rejects_duplicate_username():
    response = client.post("/api/v1/auth/register", json={"username": "dupe-user", "password": "register-pass"})
    assert response.status_code == 200
    duplicate = client.post("/api/v1/auth/register", json={"username": "dupe-user", "password": "register-pass"})
    assert duplicate.status_code == 409


def test_register_rejects_duplicate_email():
    body = {"username": "email-user", "password": "register-pass", "email": "dupe@example.test"}
    response = client.post("/api/v1/auth/register", json=body)
    assert response.status_code == 200
    duplicate = client.post(
        "/api/v1/auth/register",
        json={"username": "email-user-2", "password": "register-pass", "email": "dupe@example.test"},
    )
    assert duplicate.status_code == 409


def test_registered_user_can_login():
    response = client.post("/api/v1/auth/register", json={"username": "login-after-register", "password": "register-pass"})
    assert response.status_code == 200
    token, data = login("login-after-register", "register-pass")
    assert isinstance(token, str)
    assert data["user"]["role"] == "user"


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


def test_regular_user_cannot_access_admin_users():
    token, _ = login("guest", "guest")
    response = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_admin_can_create_admin_user():
    token = admin_token()
    response = client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "created-admin",
            "password": "new-pass",
            "email": "created-admin@example.test",
            "display_name": "Created Admin",
            "role": "admin",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["username"] == "created-admin"
    assert response.json()["data"]["role"] == "admin"


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


def test_default_admin_cannot_be_disabled_even_with_another_admin():
    token = admin_token()
    client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
        json={"username": "backup-admin", "password": "new-pass", "role": "admin"},
    )
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
