import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models import DomainBlacklist, DomainWhitelist
from app.services.deepseek_analysis_service import DeepSeekAnalysisService
from app.services.detector import Detector


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


class CountingAIService:
    def __init__(self, response=None):
        self.calls = 0
        self.response = response or {
            "status": "not_triggered",
            "provider": "deepseek",
            "model": "deepseek-chat",
            "risk_score": None,
            "label": None,
            "risk_types": [],
            "reasons": [],
            "recommendation": "",
            "confidence": 0.0,
            "error": None,
            "trigger_reasons": [],
            "reason": "not triggered",
        }

    def analyze(self, **kwargs):
        self.calls += 1
        return dict(self.response)


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture()
def db():
    reset_db()
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def risky_features(detector: Detector):
    return detector.feature_extractor.extract_features(
        "https://secure-paypal-login.example-phish.com/verify",
        "PayPal Secure Login",
        "Verify your account password to continue payment.",
        ["Verify"],
        ["Email", "Password"],
        ["secure-paypal-login.example-phish.com"],
        True,
    )


def test_rule_only_decision_thresholds(db):
    detector = Detector(db)

    assert detector._rule_only_decision(80.0)["label"] == "malicious"
    assert detector._rule_only_decision(40.0)["label"] == "suspicious"
    assert detector._rule_only_decision(10.0)["label"] == "safe"


def test_build_result_domain_policy_keeps_compat_fields(db):
    detector = Detector(db)
    result = detector._build_result(
        {
            "label": "malicious",
            "reason": "blocked by policy",
        },
        None,
    )

    assert result["label"] == "malicious"
    assert result["risk_score"] == 100.0
    assert result["rule_score"] == 0.0
    assert result["model_safe_prob"] == 0.0
    assert result["model_suspicious_prob"] == 0.0
    assert result["model_malicious_prob"] == 1.0
    assert result["behavior_score"] == result["rule_score"]
    assert result["ai_score"] is None
    assert result["ai_analysis"]["status"] == "not_triggered"
    assert result["score_breakdown"]["ai_provider"] == "deepseek"
    assert result["score_breakdown"]["fallback"] == "rule_engine_only"


def test_domain_policy_short_circuit_does_not_call_ai(db):
    detector = Detector(db)
    ai_service = CountingAIService()
    detector.ai_analysis_service = ai_service

    db.add(DomainWhitelist(domain="trusted.example", reason="trusted", source="admin", status="active"))
    db.commit()

    result = detector.detect_url("https://trusted.example", username=None)

    assert result["label"] == "safe"
    assert ai_service.calls == 0
    assert result["ai_analysis"]["status"] == "not_triggered"


def test_global_blacklist_short_circuit_does_not_call_ai(db):
    detector = Detector(db)
    ai_service = CountingAIService()
    detector.ai_analysis_service = ai_service

    db.add(DomainBlacklist(domain="blocked.example", reason="blocked", source="admin", status="active"))
    db.commit()

    result = detector.detect_url("https://blocked.example", username=None)

    assert result["label"] == "malicious"
    assert ai_service.calls == 0
    assert result["ai_analysis"]["status"] == "not_triggered"


def test_threat_intel_short_circuit_does_not_call_ai(db):
    detector = Detector(db)
    ai_service = CountingAIService()
    detector.ai_analysis_service = ai_service

    db.add(
        DomainBlacklist(
            domain="threat.example",
            reason="threat intel",
            source="threat_intel:test",
            risk_type="scam",
            status="active",
        )
    )
    db.commit()

    result = detector.detect_url("https://threat.example", username=None)

    assert result["label"] == "malicious"
    assert result["threat_intel_hit"] is True
    assert ai_service.calls == 0
    assert result["ai_analysis"]["status"] == "not_triggered"


def test_ai_success_uses_behavior_ai_fusion(db):
    detector = Detector(db)
    detector.ai_analysis_service = CountingAIService(
        {
            "status": "used",
            "provider": "deepseek",
            "model": "deepseek-chat",
            "risk_score": 90.0,
            "label": "malicious",
            "risk_types": ["phishing"],
            "reasons": ["Brand login and password collection look suspicious."],
            "recommendation": "Do not enter credentials.",
            "confidence": 0.9,
            "error": None,
            "trigger_reasons": ["matched_rule:password_field"],
        }
    )

    pipeline = detector._run_detection_pipeline(risky_features(detector))
    result = detector._build_result(None, pipeline)

    expected = (result["behavior_score"] * 0.45) + (90.0 * 0.55)
    assert result["ai_analysis"]["status"] == "used"
    assert result["ai_score"] == 90.0
    assert result["ai_fusion_used"] is True
    assert result["fallback"] is None
    assert result["score_breakdown"]["ai_fusion_used"] is True
    assert result["score_breakdown"]["fallback"] is None
    assert result["risk_score"] == pytest.approx(expected)
    assert result["label"] == ("malicious" if expected >= 70 else "suspicious")
    assert result["recommendation"] == "Do not enter credentials."


def test_low_risk_page_ai_not_triggered_uses_rule_engine_only(db):
    detector = Detector(db)

    result = detector.detect_url("https://example.com", username=None)

    assert result["label"] == "safe"
    assert result["ai_score"] is None
    assert result["ai_analysis"]["status"] == "not_triggered"
    assert result["ai_fusion_used"] is False
    assert result["fallback"] == "rule_engine_only"
    assert result["score_breakdown"]["ai_fusion_used"] is False
    assert result["score_breakdown"]["fallback"] == "rule_engine_only"
    assert result["risk_score"] == result["behavior_score"]


def test_deepseek_no_api_key_falls_back_to_rule_engine(db):
    detector = Detector(db)
    detector.ai_analysis_service = DeepSeekAnalysisService(api_key=None, enabled="true")

    pipeline = detector._run_detection_pipeline(risky_features(detector))
    result = detector._build_result(None, pipeline)

    assert result["ai_analysis"]["status"] == "no_api_key"
    assert result["ai_score"] is None
    assert result["score_breakdown"]["fallback"] == "rule_engine_only"
    assert result["risk_score"] == result["behavior_score"]
    assert "matched_rule:brand_login_mismatch_combo" in result["ai_analysis"]["trigger_reasons"]


def test_deepseek_timeout_falls_back_to_rule_engine(db):
    def transport(*_args):
        raise TimeoutError("timed out")

    detector = Detector(db)
    detector.ai_analysis_service = DeepSeekAnalysisService(api_key="secret", enabled="true", transport=transport)

    pipeline = detector._run_detection_pipeline(risky_features(detector))
    result = detector._build_result(None, pipeline)

    assert result["ai_analysis"]["status"] == "timeout"
    assert result["ai_score"] is None
    assert result["score_breakdown"]["fallback"] == "rule_engine_only"
    assert result["risk_score"] == result["behavior_score"]


def test_deepseek_error_falls_back_to_rule_engine(db):
    def transport(*_args):
        raise OSError("upstream failed with Bearer sk-secret123456")

    detector = Detector(db)
    detector.ai_analysis_service = DeepSeekAnalysisService(api_key="sk-secret123456", enabled="true", transport=transport)

    pipeline = detector._run_detection_pipeline(risky_features(detector))
    result = detector._build_result(None, pipeline)

    assert result["ai_analysis"]["status"] == "error"
    assert "sk-secret123456" not in str(result["ai_analysis"].get("error"))
    assert result["score_breakdown"]["fallback"] == "rule_engine_only"
