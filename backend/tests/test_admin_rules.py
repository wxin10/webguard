from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.config import settings
from app.core.database import Base
from app.main import app
from app.models import RuleConfig, ScanRecord
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
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    client.cookies.clear()
    settings.DEBUG = True
    settings.ENABLE_DEV_AUTH = True
    settings.DEFAULT_ADMIN_PASSWORD = "admin"
    settings.DEFAULT_GUEST_PASSWORD = "guest"


def ensure_defaults() -> None:
    db = TestingSessionLocal()
    try:
        UserService(db).ensure_default_users()
        db.commit()
    finally:
        db.close()


def login(username: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["data"]["access_token"]


def admin_token() -> str:
    ensure_defaults()
    return login("admin", "admin")


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_rule(token: str, **overrides):
    body = {
        "name": "Custom fake login",
        "type": "heuristic",
        "scope": "global",
        "status": "active",
        "version": "v1",
        "pattern": "fake-login",
        "content": '{"field":"url","operator":"contains","value":"fake-login"}',
        "description": "Test custom DSL rule",
        "category": "phishing",
        "severity": "high",
        "weight": 30,
        "threshold": 1,
    }
    body.update(overrides)
    response = client.post("/api/v1/admin/rules", headers=auth_headers(token), json=body)
    assert response.status_code == 200
    return response.json()["data"]


def test_admin_can_get_rule_list():
    token = admin_token()

    response = client.get("/api/v1/admin/rules", headers=auth_headers(token))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] >= 1
    first = data["rules"][0]
    assert {"id", "rule_key", "name", "rule_name", "enabled", "weight", "threshold"} <= set(first)


def test_regular_user_cannot_access_admin_rule_api():
    ensure_defaults()
    token = login("guest", "guest")

    response = client.get("/api/v1/admin/rules", headers=auth_headers(token))

    assert response.status_code == 403


def test_admin_can_create_dsl_rule():
    token = admin_token()

    rule = create_rule(token)

    assert rule["rule_key"] == "fake_login"
    assert rule["content"] == '{"field":"url","operator":"contains","value":"fake-login"}'
    assert rule["enabled"] is True
    assert rule["weight"] == 30.0
    assert rule["threshold"] == 1.0


def test_admin_can_edit_weight_threshold_and_status():
    token = admin_token()
    rule = create_rule(token)

    response = client.patch(
        f"/api/v1/admin/rules/{rule['id']}",
        headers=auth_headers(token),
        json={"weight": 45, "threshold": 2, "status": "disabled"},
    )

    assert response.status_code == 200
    updated = response.json()["data"]
    assert updated["weight"] == 45.0
    assert updated["threshold"] == 2.0
    assert updated["status"] == "disabled"
    assert updated["enabled"] is False


def test_enabled_false_syncs_status_disabled():
    token = admin_token()
    rule = create_rule(token)

    response = client.patch(
        f"/api/v1/admin/rules/{rule['id']}",
        headers=auth_headers(token),
        json={"enabled": False},
    )

    assert response.status_code == 200
    updated = response.json()["data"]
    assert updated["status"] == "disabled"
    assert updated["enabled"] is False


def test_admin_can_enable_rule():
    token = admin_token()
    rule = create_rule(token, status="disabled")

    response = client.patch(
        f"/api/v1/admin/rules/{rule['id']}",
        headers=auth_headers(token),
        json={"status": "active"},
    )

    assert response.status_code == 200
    updated = response.json()["data"]
    assert updated["status"] == "active"
    assert updated["enabled"] is True


def test_admin_can_disable_rule():
    token = admin_token()
    rule = create_rule(token)

    response = client.patch(
        f"/api/v1/admin/rules/{rule['id']}",
        headers=auth_headers(token),
        json={"status": "disabled"},
    )

    assert response.status_code == 200
    updated = response.json()["data"]
    assert updated["status"] == "disabled"
    assert updated["enabled"] is False


def test_rule_test_content_dsl_matches():
    token = admin_token()

    response = client.post(
        "/api/v1/admin/rules/test",
        headers=auth_headers(token),
        json={
            "rule": {
                "name": "Fake Login URL",
                "rule_key": "custom_fake_login",
                "type": "heuristic",
                "scope": "global",
                "status": "active",
                "version": "v1",
                "content": '{"field":"url","operator":"contains","value":"fake-login"}',
                "category": "phishing",
                "severity": "high",
                "weight": 30,
                "threshold": 1,
            },
            "sample": {"url": "https://example.com/fake-login"},
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["matched"] is True
    assert data["applied"] is True
    assert data["contribution"] == 30.0


def test_rule_test_pattern_fallback_matches():
    token = admin_token()

    response = client.post(
        "/api/v1/admin/rules/test",
        headers=auth_headers(token),
        json={
            "rule": {
                "name": "Pattern fake login",
                "rule_key": "custom_pattern_fake_login",
                "type": "heuristic",
                "scope": "global",
                "status": "active",
                "version": "v1",
                "pattern": "fake-login",
                "category": "phishing",
                "severity": "medium",
                "weight": 12,
                "threshold": 1,
            },
            "sample": {"url": "https://example.com/fake-login"},
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["matched"] is True
    assert data["applied"] is True
    assert data["rule_result"]["raw_feature"]["operator"] == "contains"


def test_rule_test_invalid_dsl_does_not_500():
    token = admin_token()

    response = client.post(
        "/api/v1/admin/rules/test",
        headers=auth_headers(token),
        json={
            "rule": {
                "name": "Invalid DSL",
                "rule_key": "custom_invalid_dsl",
                "type": "heuristic",
                "scope": "global",
                "status": "active",
                "version": "v1",
                "content": '{"field":"domain","operator":"regex","value":"["}',
                "category": "phishing",
                "severity": "medium",
                "weight": 10,
                "threshold": 1,
            },
            "sample": {"url": "https://example.com"},
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["matched"] is False
    assert data["applied"] is False
    assert data["reason"].startswith("Invalid rule DSL:")


def test_rule_test_does_not_write_scan_record():
    token = admin_token()
    db = TestingSessionLocal()
    try:
        before_count = db.query(ScanRecord).count()
        before_rule_count = db.query(RuleConfig).count()
    finally:
        db.close()

    response = client.post(
        "/api/v1/admin/rules/test",
        headers=auth_headers(token),
        json={
            "rule": {
                "name": "No scan record",
                "rule_key": "custom_no_scan_record",
                "type": "heuristic",
                "scope": "global",
                "status": "active",
                "version": "v1",
                "pattern": "fake-login",
                "severity": "low",
                "weight": 5,
                "threshold": 1,
            },
            "sample": {"url": "https://example.com/fake-login"},
        },
    )

    assert response.status_code == 200
    db = TestingSessionLocal()
    try:
        assert db.query(ScanRecord).count() == before_count
        assert db.query(RuleConfig).count() == before_rule_count
    finally:
        db.close()


def test_delete_rule_disables_default_rule_without_physical_delete():
    token = admin_token()
    list_response = client.get("/api/v1/admin/rules", headers=auth_headers(token))
    assert list_response.status_code == 200
    default_rule = next(item for item in list_response.json()["data"]["rules"] if item["rule_key"] == "url_length")

    response = client.delete(f"/api/v1/admin/rules/{default_rule['id']}", headers=auth_headers(token))

    assert response.status_code == 200
    db = TestingSessionLocal()
    try:
        rule = db.query(RuleConfig).filter(RuleConfig.rule_key == "url_length").first()
        assert rule is not None
        assert rule.status == "disabled"
        assert rule.enabled is False
    finally:
        db.close()
