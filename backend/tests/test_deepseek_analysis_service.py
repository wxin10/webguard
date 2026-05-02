import json

from app.services.deepseek_analysis_service import DeepSeekAnalysisService


def build_features(**overrides):
    raw_features = {
        "url": "https://example.com/login?token=secret-token&next=/home",
        "domain": "example.com",
        "title": "Example Login",
        "visible_text": "Enter password and verification code.",
        "button_texts": ["Submit"],
        "input_labels": ["Email", "Password"],
        "form_action_domains": [],
        "has_password_input": True,
    }
    raw_features.update(overrides)
    return {
        "domain": raw_features["domain"],
        "has_password_input": raw_features["has_password_input"],
        "raw_features": raw_features,
    }


def password_signal():
    return {
        "rule_key": "password_field",
        "rule_name": "Password input present",
        "matched": True,
        "severity": "low",
        "category": "page",
        "score": 2.5,
        "reason": "Page contains a password input.",
    }


def model_response(content):
    return {
        "choices": [
            {
                "message": {
                    "content": content,
                }
            }
        ]
    }


def test_no_api_key_returns_no_api_key_when_triggered():
    service = DeepSeekAnalysisService(api_key=None, enabled="auto")

    result = service.analyze(
        features=build_features(),
        behavior_score=30,
        behavior_signals=[password_signal()],
    )

    assert result["status"] == "no_api_key"
    assert result["risk_score"] is None
    assert result["trigger_reasons"]


def test_disabled_returns_disabled():
    service = DeepSeekAnalysisService(api_key="secret", enabled="false")

    result = service.analyze(
        features=build_features(),
        behavior_score=30,
        behavior_signals=[password_signal()],
    )

    assert result["status"] == "disabled"
    assert result["risk_score"] is None


def test_valid_json_response_is_parsed():
    def transport(url, payload, headers, timeout):
        assert headers["Authorization"] == "Bearer secret"
        assert payload["model"] == "deepseek-chat"
        return model_response(
            json.dumps(
                {
                    "label": "malicious",
                    "risk_score": 88,
                    "risk_types": ["phishing", "credential_theft"],
                    "reasons": ["Password and verification-code collection looks suspicious."],
                    "recommendation": "Do not enter credentials.",
                    "confidence": 0.91,
                }
            )
        )

    service = DeepSeekAnalysisService(api_key="secret", model="deepseek-chat", enabled="true", transport=transport)

    result = service.analyze(
        features=build_features(),
        behavior_score=35,
        behavior_signals=[password_signal()],
    )

    assert result["status"] == "used"
    assert result["risk_score"] == 88.0
    assert result["label"] == "malicious"
    assert result["risk_types"] == ["phishing", "credential_theft"]
    assert result["confidence"] == 0.91


def test_non_json_response_returns_error():
    service = DeepSeekAnalysisService(
        api_key="secret",
        enabled="true",
        transport=lambda *_: model_response("not json"),
    )

    result = service.analyze(
        features=build_features(),
        behavior_score=35,
        behavior_signals=[password_signal()],
    )

    assert result["status"] == "error"
    assert result["risk_score"] is None


def test_timeout_returns_timeout():
    def transport(*_):
        raise TimeoutError("timed out")

    service = DeepSeekAnalysisService(api_key="secret", enabled="true", transport=transport)

    result = service.analyze(
        features=build_features(),
        behavior_score=35,
        behavior_signals=[password_signal()],
    )

    assert result["status"] == "timeout"
    assert result["risk_score"] is None


def test_input_redaction_and_truncation():
    service = DeepSeekAnalysisService(api_key="secret", enabled="false")
    long_text = (
        "Contact user@example.com or 13800138000. Card 4111 1111 1111 1111. "
        "Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOP "
        + "x" * 3000
    )

    ai_input = service.build_analysis_input(
        build_features(
            url="https://example.com/login?token=abc123&code=secret-code&safe=value",
            visible_text=long_text,
        ),
        behavior_score=30,
        behavior_signals=[password_signal()],
    )

    assert "token=%5BREDACTED%5D" in ai_input["url"]
    assert "code=%5BREDACTED%5D" in ai_input["url"]
    assert "safe=value" in ai_input["url"]
    assert "[REDACTED_EMAIL]" in ai_input["visible_text_summary"]
    assert "[REDACTED_PHONE]" in ai_input["visible_text_summary"]
    assert "[REDACTED_ID_OR_CARD]" in ai_input["visible_text_summary"]
    assert "[REDACTED_TOKEN]" in ai_input["visible_text_summary"]
    assert len(ai_input["visible_text_summary"]) <= 1800


def test_risk_score_is_clamped_to_zero_to_one_hundred():
    service = DeepSeekAnalysisService(
        api_key="secret",
        enabled="true",
        transport=lambda *_: model_response(
            json.dumps(
                {
                    "label": "suspicious",
                    "risk_score": 150,
                    "risk_types": [],
                    "reasons": [],
                    "recommendation": "",
                    "confidence": 2,
                }
            )
        ),
    )

    result = service.analyze(
        features=build_features(),
        behavior_score=35,
        behavior_signals=[password_signal()],
    )

    assert result["status"] == "used"
    assert result["risk_score"] == 100.0
    assert result["confidence"] == 1.0


def test_invalid_label_returns_error():
    service = DeepSeekAnalysisService(
        api_key="secret",
        enabled="true",
        transport=lambda *_: model_response(
            json.dumps(
                {
                    "label": "danger",
                    "risk_score": 70,
                    "risk_types": [],
                    "reasons": [],
                    "recommendation": "",
                    "confidence": 0.5,
                }
            )
        ),
    )

    result = service.analyze(
        features=build_features(),
        behavior_score=35,
        behavior_signals=[password_signal()],
    )

    assert result["status"] == "error"
    assert result["risk_score"] is None
