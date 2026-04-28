from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models import RuleConfig
from app.services.rule_dsl import RuleDslEvaluator
from app.services.rule_engine import RuleEngine


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def build_context(**overrides):
    context = {
        "url": "https://example.com",
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


def evaluate(condition, **context_overrides):
    return RuleDslEvaluator(build_context(**context_overrides)).evaluate(condition)


def test_contains_single_condition_matches_url():
    result = evaluate(
        {"field": "url", "operator": "contains", "value": "fake-login"},
        url="https://example.com/fake-login",
    )

    assert result["matched"] is True
    assert result["observed_value"] == 1.0
    assert result["raw_feature"]["actual"] == "https://example.com/fake-login"


def test_contains_any_matches_visible_text():
    result = evaluate(
        {"field": "visible_text", "operator": "contains_any", "value": ["验证码", "转账"]},
        visible_text="请尽快输入验证码完成验证",
    )

    assert result["matched"] is True
    assert result["observed_value"] == 1.0


def test_all_requires_every_condition_to_match():
    condition = {
        "all": [
            {"field": "url", "operator": "contains", "value": "login"},
            {"field": "has_password_input", "operator": "equals", "value": True},
        ]
    }

    assert evaluate(condition, url="https://example.com/login", has_password_input=True)["matched"] is True
    assert evaluate(condition, url="https://example.com/login", has_password_input=False)["matched"] is False


def test_any_matches_when_one_condition_matches():
    condition = {
        "any": [
            {"field": "url", "operator": "contains", "value": "wallet"},
            {"field": "title", "operator": "contains", "value": "verify"},
        ]
    }

    result = evaluate(condition, url="https://example.com/home", title="Verify account")

    assert result["matched"] is True


def test_not_inverts_domain_match():
    condition = {"not": {"field": "domain", "operator": "domain_matches", "value": "example.com"}}

    assert evaluate(condition, domain="phishing.test")["matched"] is True
    assert evaluate(condition, domain="a.example.com")["matched"] is False


def test_gte_matches_url_length():
    result = evaluate(
        {"field": "url_length", "operator": "gte", "value": 30},
        url="https://example.com/path/fake-login",
    )

    assert result["matched"] is True
    assert result["observed_value"] >= 30


def test_regex_matches_and_invalid_regex_is_safe():
    matched = evaluate(
        {"field": "domain", "operator": "regex", "value": ".*-secure\\..*"},
        domain="paypal-secure.example.com",
    )
    invalid = evaluate(
        {"field": "domain", "operator": "regex", "value": "["},
        domain="paypal-secure.example.com",
    )

    assert matched["matched"] is True
    assert invalid["matched"] is False
    assert invalid["reason"].startswith("Invalid rule DSL:")


def test_domain_matches_handles_subdomains_without_false_suffix_hits():
    condition = {"field": "domain", "operator": "domain_matches", "value": "example.com"}

    assert evaluate(condition, domain="a.example.com")["matched"] is True
    assert evaluate(condition, domain="example.com")["matched"] is True
    assert evaluate(condition, domain="badexample.com")["matched"] is False


def test_count_ge_counts_matching_list_items():
    result = evaluate(
        {
            "field": "button_texts",
            "operator": "count_ge",
            "value": {"terms": ["login", "verify"], "count": 2},
        },
        button_texts=["Login now", "Cancel", "Verify account"],
    )

    assert result["matched"] is True
    assert result["observed_value"] == 2.0


def test_rule_engine_executes_custom_content_dsl():
    db = TestingSessionLocal()
    db.add(
        RuleConfig(
            rule_key="custom_fake_login",
            rule_name="Custom fake login",
            description="Custom DSL rule",
            content='{"field":"url","operator":"contains","value":"fake-login"}',
            category="url",
            severity="medium",
            weight=10.0,
            threshold=1.0,
            enabled=True,
        )
    )
    db.commit()

    engine = RuleEngine(db)
    result = engine.execute_rules(
        {
            "domain": "example.com",
            "raw_features": {
                "url": "https://example.com/fake-login",
                "domain": "example.com",
            },
        }
    )
    custom = next(item for item in result["rules"] if item["rule_key"] == "custom_fake_login")

    assert custom["matched"] is True
    assert custom["applied"] is True
    assert custom["contribution"] > 0
    db.close()


def test_rule_engine_uses_pattern_fallback_for_custom_rule_without_content():
    db = TestingSessionLocal()
    db.add(
        RuleConfig(
            rule_key="custom_pattern_fake_login",
            rule_name="Custom pattern fake login",
            description="Pattern fallback rule",
            pattern="fake-login",
            category="url",
            severity="medium",
            weight=10.0,
            threshold=1.0,
            enabled=True,
        )
    )
    db.commit()

    engine = RuleEngine(db)
    result = engine.execute_rules(
        {
            "domain": "example.com",
            "raw_features": {
                "url": "https://example.com/fake-login",
                "domain": "example.com",
            },
        }
    )
    custom = next(item for item in result["rules"] if item["rule_key"] == "custom_pattern_fake_login")

    assert custom["matched"] is True
    assert custom["applied"] is True
    assert custom["contribution"] > 0
    assert custom["raw_feature"]["operator"] == "contains"
    db.close()


def test_rule_engine_invalid_custom_dsl_does_not_raise():
    db = TestingSessionLocal()
    db.add(
        RuleConfig(
            rule_key="custom_invalid_regex",
            rule_name="Custom invalid regex",
            description="Invalid DSL should be explainable",
            content='{"field":"domain","operator":"regex","value":"["}',
            category="url",
            severity="medium",
            weight=10.0,
            threshold=1.0,
            enabled=True,
        )
    )
    db.commit()

    engine = RuleEngine(db)
    result = engine.execute_rules(
        {
            "domain": "example.com",
            "raw_features": {
                "url": "https://example.com/fake-login",
                "domain": "example.com",
            },
        }
    )
    custom = next(item for item in result["rules"] if item["rule_key"] == "custom_invalid_regex")

    assert custom["matched"] is False
    assert custom["applied"] is False
    assert custom["contribution"] == 0.0
    assert custom["reason"].startswith("Invalid rule DSL:")
    db.close()
