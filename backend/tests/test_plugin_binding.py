from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.database import Base
from app.core.security import create_access_token, decode_access_token
from app.main import app
from app.models import PluginBindingChallenge, PluginInstance, PluginRefreshToken, User


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


def reset_db() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture()
def client():
    reset_db()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def create_user(username: str = "binding-user", role: str = "user") -> User:
    db = TestingSessionLocal()
    try:
        user = User(
            username=username,
            email=f"{username}@example.test",
            display_name=username,
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def auth_headers(username: str = "binding-user", role: str = "user") -> dict[str, str]:
    token = create_access_token(subject=username, role=role)
    return {"Authorization": f"Bearer {token}"}


def create_confirmed_challenge(client: TestClient, plugin_instance_id: str = "plugin_test_1") -> tuple[str, str]:
    response = client.post(
        "/api/v1/plugin/binding-challenges",
        headers={"X-Plugin-Instance-Id": plugin_instance_id, "X-Plugin-Version": "1.0.0"},
        json={"web_base_url": "http://127.0.0.1:5173"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    confirm_response = client.post(
        f"/api/v1/plugin/binding-challenges/{data['challenge_id']}/confirm",
        headers=auth_headers(),
        json={"binding_code": data["binding_code"], "display_name": "Test Browser"},
    )
    assert confirm_response.status_code == 200
    return data["challenge_id"], data["binding_code"]


def exchange_plugin_token(client: TestClient, plugin_instance_id: str = "plugin_test_1") -> dict:
    challenge_id, binding_code = create_confirmed_challenge(client, plugin_instance_id)
    response = client.post(
        "/api/v1/plugin/token",
        headers={"X-Plugin-Instance-Id": plugin_instance_id, "X-Plugin-Version": "1.0.0"},
        json={"challenge_id": challenge_id, "binding_code": binding_code},
    )
    assert response.status_code == 200
    return response.json()["data"]


def test_create_binding_challenge_stores_only_code_hash(client: TestClient):
    response = client.post(
        "/api/v1/plugin/binding-challenges",
        headers={"X-Plugin-Instance-Id": "plugin_create_challenge", "X-Plugin-Version": "1.0.0"},
        json={"web_base_url": "http://127.0.0.1:5173"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    data = payload["data"]
    assert data["challenge_id"].startswith("bind_chal_")
    assert len(data["binding_code"]) == 6
    assert data["verification_url"].endswith(f"/app/plugin-bind?challenge_id={data['challenge_id']}")

    db = TestingSessionLocal()
    try:
        challenge = db.query(PluginBindingChallenge).filter(
            PluginBindingChallenge.challenge_id == data["challenge_id"]
        ).one()
        assert challenge.plugin_instance_id == "plugin_create_challenge"
        assert challenge.binding_code_hash != data["binding_code"]
        assert challenge.status == "pending"
    finally:
        db.close()


def test_logged_in_user_confirms_binding_challenge(client: TestClient):
    create_user()

    response = client.post(
        "/api/v1/plugin/binding-challenges",
        headers={"X-Plugin-Instance-Id": "plugin_confirm", "X-Plugin-Version": "1.0.0"},
        json={},
    )
    data = response.json()["data"]
    confirm = client.post(
        f"/api/v1/plugin/binding-challenges/{data['challenge_id']}/confirm",
        headers=auth_headers(),
        json={"binding_code": data["binding_code"], "display_name": "Office Chrome"},
    )

    assert confirm.status_code == 200
    assert confirm.json()["data"]["plugin_instance_id"] == "plugin_confirm"
    assert confirm.json()["data"]["status"] == "confirmed"


def test_plugin_token_exchange_creates_bound_instance_and_tokens(client: TestClient):
    create_user()

    data = exchange_plugin_token(client, "plugin_exchange")

    assert data["plugin_instance_id"] == "plugin_exchange"
    assert data["token_type"] == "Bearer"
    assert data["access_token"]
    assert data["refresh_token"]
    payload = decode_access_token(data["access_token"])
    assert payload["sub"] == "binding-user"
    assert payload["token_scope"] == "plugin"
    assert payload["plugin_instance_id"] == "plugin_exchange"

    db = TestingSessionLocal()
    try:
        assert db.query(PluginInstance).filter(PluginInstance.plugin_instance_id == "plugin_exchange").count() == 1
        assert db.query(PluginRefreshToken).filter(PluginRefreshToken.plugin_instance_id == "plugin_exchange").count() == 1
    finally:
        db.close()


def test_plugin_refresh_token_rotates(client: TestClient):
    create_user()
    token_data = exchange_plugin_token(client, "plugin_refresh")

    response = client.post(
        "/api/v1/plugin/token/refresh",
        headers={"X-Plugin-Instance-Id": "plugin_refresh"},
        json={"refresh_token": token_data["refresh_token"]},
    )

    assert response.status_code == 200
    refreshed = response.json()["data"]
    assert refreshed["refresh_token"] != token_data["refresh_token"]
    payload = decode_access_token(refreshed["access_token"])
    assert payload["plugin_instance_id"] == "plugin_refresh"


def test_revoked_plugin_instance_rejects_existing_plugin_access_token(client: TestClient):
    create_user()
    token_data = exchange_plugin_token(client, "plugin_revoke")

    revoke = client.delete("/api/v1/plugin/instances/plugin_revoke", headers=auth_headers())
    assert revoke.status_code == 200
    assert revoke.json()["data"]["status"] == "revoked"

    bootstrap = client.get(
        "/api/v1/plugin/bootstrap",
        headers={
            "Authorization": f"Bearer {token_data['access_token']}",
            "X-Plugin-Instance-Id": "plugin_revoke",
        },
    )
    assert bootstrap.status_code == 403
    assert bootstrap.json() == {
        "code": 40301,
        "message": "plugin instance revoked or inactive",
        "data": None,
    }


def test_wrong_binding_code_fails(client: TestClient):
    create_user()
    response = client.post(
        "/api/v1/plugin/binding-challenges",
        headers={"X-Plugin-Instance-Id": "plugin_wrong_code"},
        json={},
    )
    data = response.json()["data"]

    confirm = client.post(
        f"/api/v1/plugin/binding-challenges/{data['challenge_id']}/confirm",
        headers=auth_headers(),
        json={"binding_code": "000000"},
    )

    assert confirm.status_code == 403
    assert confirm.json()["message"] == "binding code invalid"


def test_expired_binding_challenge_fails(client: TestClient):
    create_user()
    response = client.post(
        "/api/v1/plugin/binding-challenges",
        headers={"X-Plugin-Instance-Id": "plugin_expired"},
        json={},
    )
    data = response.json()["data"]
    db = TestingSessionLocal()
    try:
        challenge = db.query(PluginBindingChallenge).filter(
            PluginBindingChallenge.challenge_id == data["challenge_id"]
        ).one()
        challenge.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()

    confirm = client.post(
        f"/api/v1/plugin/binding-challenges/{data['challenge_id']}/confirm",
        headers=auth_headers(),
        json={"binding_code": data["binding_code"]},
    )

    assert confirm.status_code == 422
    assert confirm.json()["message"] == "binding challenge expired"
