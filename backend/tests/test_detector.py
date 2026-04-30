from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.database import Base
from app.models import DomainBlacklist, DomainWhitelist
from app.services.deepseek_analysis_service import DeepSeekAnalysisService
from app.services.detector import Detector

# 创建共享的 SQLite 内存测试数据库
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建测试表
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


class StaticModelService:
    def predict(self, model_input):
        return {
            "safe_prob": 0.9,
            "suspicious_prob": 0.05,
            "malicious_prob": 0.05,
            "predicted_label": "safe",
        }


def test_fuse_decision():
    """测试融合决策逻辑"""
    db = TestingSessionLocal()
    detector = Detector(db)
    
    # 测试恶意情况
    rule_score = 80.0
    model_probs = {
        'safe_prob': 0.1,
        'suspicious_prob': 0.2,
        'malicious_prob': 0.7
    }
    result = detector._fuse_decision(rule_score, model_probs)
    assert result['label'] == 'malicious'
    assert result['risk_score'] > 70.0
    
    # 测试可疑情况
    rule_score = 40.0
    model_probs = {
        'safe_prob': 0.3,
        'suspicious_prob': 0.6,
        'malicious_prob': 0.1
    }
    result = detector._fuse_decision(rule_score, model_probs)
    assert result['label'] == 'suspicious'
    assert 30.0 < result['risk_score'] < 70.0
    
    # 测试安全情况
    rule_score = 10.0
    model_probs = {
        'safe_prob': 0.9,
        'suspicious_prob': 0.05,
        'malicious_prob': 0.05
    }
    result = detector._fuse_decision(rule_score, model_probs)
    assert result['label'] == 'safe'
    assert result['risk_score'] < 30.0
    
    db.close()


def test_build_result():
    """测试构建结果逻辑"""
    db = TestingSessionLocal()
    detector = Detector(db)
    
    # 测试黑白名单结果
    domain_list_result = {
        'label': 'malicious',
        'reason': '域名在黑名单中'
    }
    result = detector._build_result(domain_list_result, None)
    assert result['label'] == 'malicious'
    assert result['risk_score'] == 100.0
    assert result['rule_score'] == 0.0
    assert result['model_safe_prob'] == 0.0
    assert result['model_malicious_prob'] == 1.0
    assert result["policy_hit"]["hit"] is False
    assert result["threat_intel_hit"] is False
    assert result["threat_intel_matches"] == []
    assert result["behavior_score"] == result["rule_score"]
    assert result["behavior_signals"] == []
    assert result["ai_score"] is None
    assert result["ai_analysis"]["status"] == "not_used"
    assert result["score_breakdown"]["behavior_score"] == result["rule_score"]

    policy_result = detector._build_result(
        {
            "label": "safe",
            "reason": "trusted by user policy",
            "policy_hit": {
                "hit": True,
                "scope": "user",
                "list_type": "trusted",
                "source": "web",
                "reason": "trusted by user policy",
            },
        },
        None,
    )
    assert policy_result["label"] == "safe"
    assert policy_result["policy_hit"]["hit"] is True
    assert policy_result["policy_hit"]["scope"] == "user"
    assert policy_result["score_breakdown"]["policy_hit"]["hit"] is True
     
    # 测试流水线结果
    pipeline_result = {
        'fuse_result': {
            'label': 'safe',
            'risk_score': 10.0
        },
        'rule_score': 5.0,
        'hit_rules': [],
        'model_result': {
            'safe_prob': 0.9,
            'suspicious_prob': 0.05,
            'malicious_prob': 0.05
        },
        'score_breakdown': {
            'final_score': 10.0,
            'label': 'safe',
        },
        'explanation': '测试解释',
        'recommendation': '测试建议'
    }
    result = detector._build_result(None, pipeline_result)
    assert result['label'] == 'safe'
    assert result['risk_score'] == 10.0
    assert result['rule_score'] == 5.0
    assert result['model_safe_prob'] == 0.9
    assert result["policy_hit"]["hit"] is False
    assert result["behavior_score"] == 5.0
    assert result["ai_score"] is None
    assert result["score_breakdown"]["fallback"] == "legacy_model_fusion"
    
    # 测试默认结果
    result = detector._build_result(None, None)
    assert result['label'] == 'safe'
    assert result['risk_score'] == 0.0
    assert result['rule_score'] == 0.0
    assert result['model_safe_prob'] == 1.0
    assert result["policy_hit"]["hit"] is False
    assert result["threat_intel_hit"] is False
    assert result["behavior_score"] == 0.0
    
    db.close()


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_domain_policy_short_circuit_does_not_call_ai():
    reset_db()
    db = TestingSessionLocal()
    detector = Detector(db)
    ai_service = CountingAIService()
    detector.ai_analysis_service = ai_service

    db.add(DomainWhitelist(domain="trusted.example", reason="trusted", source="admin", status="active"))
    db.commit()

    result = detector.detect_url("https://trusted.example", username=None)

    assert result["label"] == "safe"
    assert ai_service.calls == 0
    assert result["ai_analysis"]["status"] == "not_used"
    db.close()


def test_global_blacklist_short_circuit_does_not_call_ai():
    reset_db()
    db = TestingSessionLocal()
    detector = Detector(db)
    ai_service = CountingAIService()
    detector.ai_analysis_service = ai_service

    db.add(DomainBlacklist(domain="blocked.example", reason="blocked", source="admin", status="active"))
    db.commit()

    result = detector.detect_url("https://blocked.example", username=None)

    assert result["label"] == "malicious"
    assert ai_service.calls == 0
    assert result["ai_analysis"]["status"] == "not_used"
    db.close()


def test_threat_intel_short_circuit_does_not_call_ai():
    reset_db()
    db = TestingSessionLocal()
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
    assert result["ai_analysis"]["status"] == "not_used"
    db.close()


def test_ai_success_uses_behavior_ai_fusion():
    reset_db()
    db = TestingSessionLocal()
    detector = Detector(db)
    detector.model_service = StaticModelService()
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

    features = detector.feature_extractor.extract_features(
        "https://secure-paypal-login.example-phish.com/verify",
        "PayPal Secure Login",
        "Verify your account password to continue payment.",
        ["Verify"],
        ["Email", "Password"],
        ["secure-paypal-login.example-phish.com"],
        True,
    )
    pipeline = detector._run_detection_pipeline(features)
    result = detector._build_result(None, pipeline)

    expected = (result["behavior_score"] * 0.45) + (90.0 * 0.55)
    assert result["ai_score"] == 90.0
    assert result["score_breakdown"]["ai_fusion_used"] is True
    assert result["risk_score"] == expected
    assert result["label"] == ("malicious" if expected >= 70 else "suspicious")
    assert result["recommendation"] == "Do not enter credentials."
    db.close()


def test_low_risk_page_ai_not_triggered_uses_legacy_fusion():
    reset_db()
    db = TestingSessionLocal()
    detector = Detector(db)
    detector.model_service = StaticModelService()

    result = detector.detect_url("https://example.com", username=None)

    assert result["label"] == "safe"
    assert result["ai_score"] is None
    assert result["ai_analysis"]["status"] == "not_triggered"
    assert result["score_breakdown"]["ai_fusion_used"] is False
    assert result["score_breakdown"]["fallback"] == "legacy_model_fusion"
    db.close()


def test_brand_login_mismatch_triggers_ai_analysis():
    reset_db()
    db = TestingSessionLocal()
    detector = Detector(db)
    detector.model_service = StaticModelService()
    detector.ai_analysis_service = DeepSeekAnalysisService(api_key=None, enabled="true")

    features = detector.feature_extractor.extract_features(
        "https://secure-paypal-login.example-phish.com/verify",
        "PayPal Secure Login",
        "Verify your account password to continue payment.",
        ["Verify"],
        ["Email", "Password"],
        ["secure-paypal-login.example-phish.com"],
        True,
    )
    pipeline = detector._run_detection_pipeline(features)

    assert pipeline["ai_analysis"]["status"] == "no_api_key"
    assert "matched_rule:brand_login_mismatch_combo" in pipeline["ai_analysis"]["trigger_reasons"]
    db.close()


def test_wallet_secret_combo_triggers_ai_analysis():
    reset_db()
    db = TestingSessionLocal()
    detector = Detector(db)
    detector.model_service = StaticModelService()
    detector.ai_analysis_service = DeepSeekAnalysisService(api_key=None, enabled="true")

    features = detector.feature_extractor.extract_features(
        "https://wallet.example.com/recover",
        "Wallet recovery",
        "Enter your wallet seed phrase or private key to recover access.",
        ["Recover wallet"],
        [],
        [],
        False,
    )
    pipeline = detector._run_detection_pipeline(features)

    assert pipeline["ai_analysis"]["status"] == "no_api_key"
    assert "matched_rule:wallet_secret_combo" in pipeline["ai_analysis"]["trigger_reasons"]
    db.close()
