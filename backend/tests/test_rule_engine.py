from urllib.parse import urlparse

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.database import Base
from app.models import RuleConfig
from app.services.rule_engine import DEFAULT_RULES, DEFAULT_RULE_VERSION, RuleEngine


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def rule_engine(db):
    return RuleEngine(db)


def build_context(**overrides):
    context = {
        "url": "http://example.com",
        "domain": "example.com",
        "title": "",
        "visible_text": "",
        "button_texts": [],
        "input_labels": [],
        "form_action_domains": [],
        "has_password_input": False,
        "all_text": "",
    }
    context.update(overrides)
    return context


def build_features(
    *,
    url: str = "https://example.com",
    title: str = "",
    visible_text: str = "",
    button_texts: list[str] | None = None,
    input_labels: list[str] | None = None,
    form_action_domains: list[str] | None = None,
    has_password_input: bool = False,
):
    domain = urlparse(url).hostname or ""
    return {
        "domain": domain,
        "has_password_input": has_password_input,
        "raw_features": {
            "url": url,
            "domain": domain,
            "title": title,
            "visible_text": visible_text,
            "button_texts": button_texts or [],
            "input_labels": input_labels or [],
            "form_action_domains": form_action_domains or [],
            "has_password_input": has_password_input,
        },
    }


def get_rule(rule_engine: RuleEngine, rule_key: str):
    return next(rule for rule in rule_engine.rules if rule.rule_key == rule_key)


def default_rule(rule_key: str) -> dict:
    return next(item for item in DEFAULT_RULES if item["rule_key"] == rule_key)


def matched_keys(result: dict) -> set[str]:
    return {item["rule_key"] for item in result["hit_rules"] if item["matched"]}


def get_hit(result: dict, rule_key: str) -> dict:
    return next(item for item in result["hit_rules"] if item["rule_key"] == rule_key)


def test_check_url_length_uses_complexity_not_binary(rule_engine: RuleEngine):
    rule = get_rule(rule_engine, "url_length")
    rule.threshold = 100

    result = rule_engine.check_url_length(rule, build_context(url="http://example.com/" + "a" * 200))
    assert result["matched"] is True
    assert 0.0 < result["raw_score"] < 1.0
    assert result["rule_key"] == "url_length"
    assert result["caution"] is True
    assert "single" in result["false_positive_note"].lower() or "combine" in result["false_positive_note"].lower()

    result = rule_engine.check_url_length(rule, build_context(url="http://example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0


def test_check_ip_direct_is_sensitive_but_not_full_score(rule_engine: RuleEngine):
    rule = get_rule(rule_engine, "ip_direct")

    result = rule_engine.check_ip_direct(rule, build_context(url="http://192.168.1.1"))
    assert result["matched"] is True
    assert 0.0 < result["raw_score"] < 1.0
    assert result["rule_key"] == "ip_direct"
    assert result["caution"] is True

    result = rule_engine.check_ip_direct(rule, build_context(url="http://example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0


def test_check_suspicious_subdomain_is_weak_signal(rule_engine: RuleEngine):
    rule = get_rule(rule_engine, "suspicious_subdomain")

    result = rule_engine.check_suspicious_subdomain(rule, build_context(domain="login.example.com"))
    assert result["matched"] is True
    assert 0.0 < result["raw_score"] < 1.0
    assert result["rule_key"] == "suspicious_subdomain"
    assert result["caution"] is True

    result = rule_engine.check_suspicious_subdomain(rule, build_context(domain="www.example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0


def test_check_title_domain_mismatch_is_low_weight_supporting_signal(rule_engine: RuleEngine):
    rule = get_rule(rule_engine, "title_domain_mismatch")

    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="Google Search", domain="example.com"))
    assert result["rule_key"] == "title_domain_mismatch"
    assert result["matched"] is True
    assert result["raw_score"] <= 0.5
    assert result["caution"] is True

    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="Example Home", domain="example.com"))
    assert result["rule_key"] == "title_domain_mismatch"
    assert result["matched"] is False

    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="", domain="example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0

    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="Example", domain=""))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0


def test_default_rules_upgrade_existing_v1_builtin_weights(db):
    db.add_all(
        [
            RuleConfig(
                rule_key="password_field",
                rule_name="Old password rule",
                description="Old description",
                type="heuristic",
                scope="global",
                version="v1",
                category="page",
                severity="high",
                weight=12.0,
                threshold=1.0,
                enabled=True,
            ),
            RuleConfig(
                rule_key="brand_impersonation",
                rule_name="Old brand rule",
                description="Old description",
                type="heuristic",
                scope="global",
                version="v1",
                category="content",
                severity="critical",
                weight=20.0,
                threshold=1.0,
                enabled=True,
            ),
        ]
    )
    db.commit()

    RuleEngine(db)

    password_rule = db.query(RuleConfig).filter(RuleConfig.rule_key == "password_field").one()
    brand_rule = db.query(RuleConfig).filter(RuleConfig.rule_key == "brand_impersonation").one()
    password_default = default_rule("password_field")
    brand_default = default_rule("brand_impersonation")
    assert password_rule.weight == password_default["weight"]
    assert password_rule.severity == password_default["severity"]
    assert password_rule.description == password_default["description"]
    assert password_rule.version == DEFAULT_RULE_VERSION
    assert brand_rule.weight == brand_default["weight"]
    assert brand_rule.severity == brand_default["severity"]
    assert brand_rule.description == brand_default["description"]
    assert brand_rule.version == DEFAULT_RULE_VERSION


def test_default_rules_do_not_delete_or_overwrite_custom_rules(db):
    custom_rule = RuleConfig(
        rule_key="custom_sensitive_token_rule",
        rule_name="Custom sensitive token rule",
        description="Administrator managed custom rule",
        type="heuristic",
        scope="global",
        version="v1",
        category="custom",
        severity="critical",
        weight=33.0,
        threshold=2.0,
        enabled=False,
        pattern="custom-token",
    )
    db.add(custom_rule)
    db.commit()

    RuleEngine(db)

    stored = db.query(RuleConfig).filter(RuleConfig.rule_key == "custom_sensitive_token_rule").one()
    assert stored.rule_name == "Custom sensitive token rule"
    assert stored.description == "Administrator managed custom rule"
    assert stored.category == "custom"
    assert stored.severity == "critical"
    assert stored.weight == 33.0
    assert stored.threshold == 2.0
    assert stored.enabled is False
    assert stored.pattern == "custom-token"
    assert stored.version == "v1"


def test_normal_login_page_does_not_become_high_risk(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://example.com/login",
            title="Example Login",
            visible_text="Sign in to your account.",
            button_texts=["Sign in"],
            input_labels=["Email", "Password"],
            form_action_domains=["example.com"],
            has_password_input=True,
        )
    )

    keys = matched_keys(result)
    assert {"risky_path", "password_field"}.issubset(keys)
    assert "credential_exfiltration_combo" not in keys
    assert "brand_login_mismatch_combo" not in keys
    assert result["rule_score"] < 20.0


def test_normal_payment_page_with_trusted_provider_is_not_malicious(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://shop.example.com/payment/checkout",
            title="Example checkout",
            visible_text="Complete payment with a card or PayPal.",
            button_texts=["Pay now"],
            form_action_domains=["stripe.com"],
        )
    )

    keys = matched_keys(result)
    assert "risky_path" in keys
    assert "cross_domain_form" not in keys
    assert "payment_urgency_combo" not in keys
    assert result["rule_score"] < 20.0


def test_plain_redirect_copy_is_low_risk(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://example.com/redirecting",
            title="Redirecting",
            visible_text="Loading, you will be redirected shortly.",
        )
    )

    keys = matched_keys(result)
    assert "suspicious_redirect" in keys
    assert "suspicious_redirect_combo" not in keys
    assert result["rule_score"] < 15.0


def test_brand_login_mismatch_raises_behavior_risk(rule_engine: RuleEngine):
    normal = rule_engine.execute_rules(
        build_features(
            url="https://paypal.com/login",
            title="PayPal Login",
            visible_text="Sign in to your PayPal account.",
            button_texts=["Sign in"],
            input_labels=["Email", "Password"],
            form_action_domains=["paypal.com"],
            has_password_input=True,
        )
    )
    phishing = rule_engine.execute_rules(
        build_features(
            url="https://secure-paypal-login.example-phish.com/verify",
            title="PayPal Secure Login",
            visible_text="Verify your account password to continue payment.",
            button_texts=["Sign in", "Verify"],
            input_labels=["Email", "Password"],
            form_action_domains=["secure-paypal-login.example-phish.com"],
            has_password_input=True,
        )
    )

    assert "brand_login_mismatch_combo" in matched_keys(phishing)
    assert phishing["rule_score"] > normal["rule_score"] + 10.0


def test_chinese_brand_login_mismatch_triggers_combo(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://alipay-security.example-phish.com/login",
            title="支付宝安全验证",
            visible_text="支付宝账户异常，请输入密码完成验证。",
            button_texts=["立即验证"],
            input_labels=["账号", "密码"],
            form_action_domains=["alipay-security.example-phish.com"],
            has_password_input=True,
        )
    )

    keys = matched_keys(result)
    assert "brand_impersonation" in keys
    assert "brand_login_mismatch_combo" in keys
    brand_rule = get_hit(result, "brand_impersonation")
    assert "支付宝" in brand_rule["evidence"]["brand_context"]["mismatched"]


def test_cross_domain_credential_submission_triggers_combo(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://example.com/login",
            title="Example Login",
            visible_text="Enter your account password.",
            input_labels=["Email", "Password"],
            form_action_domains=["credential-drop.example.net"],
            has_password_input=True,
        )
    )

    keys = matched_keys(result)
    assert "cross_domain_form" in keys
    assert "credential_exfiltration_combo" in keys
    combo = get_hit(result, "credential_exfiltration_combo")
    assert "password_input_with_unknown_cross_domain_form" in combo["evidence"]["triggers"]


def test_ip_direct_with_sensitive_input_triggers_combo(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="http://192.168.1.20/login",
            title="Account verification",
            visible_text="Enter password and verification code.",
            input_labels=["Password", "Verification code"],
            has_password_input=True,
        )
    )

    keys = matched_keys(result)
    assert "ip_direct" in keys
    assert "ip_sensitive_input_combo" in keys
    assert "credential_exfiltration_combo" in keys


def test_wallet_secret_phrase_triggers_critical_combo(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://wallet.example.com/recover",
            title="Wallet recovery",
            visible_text="Enter your wallet seed phrase or private key to recover access.",
            button_texts=["Recover wallet"],
        )
    )

    keys = matched_keys(result)
    assert "wallet_secret_combo" in keys
    combo = get_hit(result, "wallet_secret_combo")
    assert combo["severity"] == "critical"
    assert combo["contribution"] > 0


def test_payment_urgency_triggers_combo(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://example.com/security",
            title="Account risk notice",
            visible_text="银行卡 验证码 立即 提交，否则账户将冻结。",
            button_texts=["立即验证"],
        )
    )

    keys = matched_keys(result)
    assert "risky_keywords" in keys
    assert "payment_urgency_combo" in keys


def test_chinese_payment_verification_submit_immediately_triggers_combo(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://example.com/notice",
            title="支付验证",
            visible_text="支付 验证码 立即 提交",
        )
    )

    keys = matched_keys(result)
    assert "payment_urgency_combo" in keys
    combo = get_hit(result, "payment_urgency_combo")
    assert {"支付", "验证码"} & set(combo["evidence"]["payment_terms"])


def test_english_payment_verification_submit_immediately_triggers_combo(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://example.com/notice",
            title="Payment verification",
            visible_text="payment verification code submit immediately",
        )
    )

    keys = matched_keys(result)
    assert "payment_urgency_combo" in keys
    combo = get_hit(result, "payment_urgency_combo")
    assert {"payment", "verification code"} & set(combo["evidence"]["payment_terms"])


def test_complex_url_scores_higher_but_not_alone_malicious(rule_engine: RuleEngine):
    simple = rule_engine.execute_rules(build_features(url="https://example.com/product"))
    complex_url = (
        "https://example.com/login?"
        "redirect_uri=https%3A%2F%2Fevil.example.net%2Fcollect"
        "&return=https%3A%2F%2Fother.example.net%2Fnext"
        "&token=QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1Njc4OTAxMjM0NTY3ODkw"
        "&utm_source=newsletter&utm_medium=email&utm_campaign=spring"
    )
    complex_result = rule_engine.execute_rules(build_features(url=complex_url))

    keys = matched_keys(complex_result)
    assert "url_length" in keys
    assert "suspicious_redirect" in keys
    assert complex_result["rule_score"] > simple["rule_score"]
    assert complex_result["rule_score"] < 30.0


def test_rule_output_keeps_legacy_fields_and_adds_signal_metadata(rule_engine: RuleEngine):
    result = rule_engine.execute_rules(
        build_features(
            url="https://example.com/login",
            title="Example Login",
            visible_text="Enter your account password.",
            input_labels=["Password"],
            has_password_input=True,
        )
    )

    assert "hit_rules" in result
    assert "rules" in result
    assert "rule_score" in result
    assert result["hit_rules"] == result["rules"]
    first_rule = result["hit_rules"][0]
    for field in (
        "rule_key",
        "rule_name",
        "matched",
        "applied",
        "category",
        "severity",
        "weight",
        "threshold",
        "raw_score",
        "weighted_score",
        "contribution",
        "reason",
        "detail",
        "raw_feature",
        "observed_value",
        "evidence",
        "caution",
        "false_positive_note",
    ):
        assert field in first_rule
