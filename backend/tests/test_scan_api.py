import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.database import Base
from app.main import app
from app.models import DomainBlacklist, Report, ScanRecord


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


def test_scan_url_safe_result_persists_record_and_report(client: TestClient):
    response = client.post("/api/v1/scan/url", json={"url": "https://example.com"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0

    data = payload["data"]
    assert data["url"] == "https://example.com"
    assert data["domain"] == "example.com"
    assert data["label"] == "safe"
    assert data["action"] == "ALLOW"
    assert data["should_warn"] is False
    assert data["should_block"] is False
    assert isinstance(data["summary"], str) and data["summary"]
    assert data["record_id"] > 0
    assert data["report_id"] > 0
    assert data["policy_hit"]["hit"] is False
    assert data["threat_intel_hit"] is False
    assert data["threat_intel_matches"] == []
    assert data["behavior_score"] == data["rule_score"]
    assert data["ai_score"] is None
    assert data["ai_analysis"]["status"] == "not_triggered"
    assert data["score_breakdown"]["behavior_score"] == data["rule_score"]
    assert data["score_breakdown"]["ai_fusion_used"] is False
    assert data["score_breakdown"]["fallback"] == "legacy_model_fusion"

    record_response = client.get(f"/api/v1/records/{data['record_id']}")
    assert record_response.status_code == 200
    record_payload = record_response.json()
    assert record_payload["code"] == 0
    assert record_payload["data"]["id"] == data["record_id"]
    assert record_payload["data"]["report_id"] == data["report_id"]
    assert record_payload["data"]["risk_level"] == "safe"

    report_response = client.get(f"/api/v1/reports/{data['report_id']}")
    assert report_response.status_code == 200
    report_payload = report_response.json()
    assert report_payload["code"] == 0
    assert report_payload["data"]["id"] == data["report_id"]
    assert report_payload["data"]["record_id"] == data["record_id"]
    assert report_payload["data"]["risk_level"] == "safe"

    db = TestingSessionLocal()
    try:
        assert db.query(ScanRecord).filter(ScanRecord.id == data["record_id"]).count() == 1
        assert db.query(Report).filter(Report.id == data["report_id"]).count() == 1
    finally:
        db.close()


def test_plugin_analyze_current_high_risk_can_trigger_block_flow(client: TestClient):
    response = client.post(
        "/api/v1/plugin/analyze-current",
        json={
            "url": "https://login-paypal-account-security.example-phish.com/verify/password",
            "title": "PayPal Secure Login",
            "visible_text": "Verify your account password to continue payment.",
            "button_texts": ["Sign in", "Verify"],
            "input_labels": ["Email", "Password"],
            "form_action_domains": ["secure-paypal.example-phish.com"],
            "has_password_input": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0

    data = payload["data"]
    assert data["label"] == "malicious"
    assert data["action"] == "BLOCK"
    assert data["should_warn"] is True
    assert data["should_block"] is True
    assert data["risk_score"] > 0
    assert data["record_id"] > 0
    assert data["report_id"] > 0
    assert data["domain"] == "login-paypal-account-security.example-phish.com"
    assert len(data["reason_summary"]) >= 1
    assert data["policy_hit"]["hit"] is False
    assert data["threat_intel_hit"] is False
    assert data["threat_intel_matches"] == []
    assert data["behavior_score"] == data["rule_score"]
    assert len(data["behavior_signals"]) >= 1
    assert data["ai_score"] is None
    assert data["ai_analysis"]["status"] in {"no_api_key", "disabled"}

    report_response = client.get(f"/api/v1/reports/{data['report_id']}")
    assert report_response.status_code == 200
    report_payload = report_response.json()
    assert report_payload["code"] == 0
    assert report_payload["data"]["risk_level"] == "malicious"
    assert report_payload["data"]["record_id"] == data["record_id"]


def test_scan_url_threat_intel_blacklist_hit_blocks_and_explains(client: TestClient):
    db = TestingSessionLocal()
    try:
        db.add(
            DomainBlacklist(
                domain="phish.example",
                source="threat_intel:scamblocklist",
                risk_type="scam",
                reason="命中外部恶意网站规则库：Scam Blocklist by DurableNapkin；风险类型：scam",
                status="active",
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.post("/api/v1/scan/url", json={"url": "https://phish.example/login"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    data = payload["data"]
    assert data["label"] == "malicious"
    assert data["risk_score"] == 100.0
    assert data["action"] == "BLOCK"
    assert data["should_block"] is True
    assert data["policy_hit"]["hit"] is True
    assert data["policy_hit"]["source"] == "threat_intel:scamblocklist"
    assert data["threat_intel_hit"] is True
    assert data["threat_intel_matches"] == [
        {
            "domain": "phish.example",
            "source": "threat_intel:scamblocklist",
            "risk_type": "scam",
            "reason": "命中外部恶意网站规则库：Scam Blocklist by DurableNapkin；风险类型：scam",
        }
    ]
    assert "外部恶意网站规则库" in data["summary"]
    assert "外部恶意网站规则库" in data["explanation"]
    assert any("外部恶意网站规则库" in item for item in data["reason_summary"])
    assert data["ai_score"] is None
    assert data["ai_analysis"]["status"] == "not_used"


def test_plugin_analyze_ai_failure_falls_back_to_legacy_fusion(client: TestClient):
    response = client.post(
        "/api/v1/plugin/analyze-current",
        json={
            "url": "https://verify-account.example.com/login",
            "title": "Account verification",
            "visible_text": "Enter password and verification code.",
            "button_texts": ["Verify"],
            "input_labels": ["Email", "Password"],
            "form_action_domains": ["verify-account.example.com"],
            "has_password_input": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    data = payload["data"]
    assert data["ai_score"] is None
    assert data["ai_analysis"]["status"] in {"no_api_key", "disabled"}
    assert data["score_breakdown"]["ai_fusion_used"] is False
    assert data["score_breakdown"]["fallback"] == "legacy_model_fusion"
    assert "label" in data
    assert "risk_score" in data
    assert "action" in data
    assert "should_block" in data
    assert "hit_rules" in data


def test_scan_url_invalid_format_returns_40002(client: TestClient):
    response = client.post("/api/v1/scan/url", json={"url": "example.com"})
    assert response.status_code == 400
    assert response.json() == {
        "code": 40002,
        "message": "invalid parameter",
        "data": None,
    }


def test_plugin_analyze_invalid_format_returns_40002(client: TestClient):
    response = client.post(
        "/api/v1/plugin/analyze-current",
        json={
            "url": "example.com",
            "title": "Example",
            "visible_text": "Example",
            "button_texts": [],
            "input_labels": [],
            "form_action_domains": [],
            "has_password_input": False,
        },
    )
    assert response.status_code == 400
    assert response.json() == {
        "code": 40002,
        "message": "invalid parameter",
        "data": None,
    }


def test_scan_url_validation_error_contract(client: TestClient):
    response = client.post("/api/v1/scan/url", json={})
    assert response.status_code == 400
    assert response.json() == {
        "code": 40002,
        "message": "invalid parameter",
        "data": None,
    }
