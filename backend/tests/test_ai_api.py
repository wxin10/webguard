from fastapi.testclient import TestClient

from app.main import app


def test_ai_status_without_key(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_API_KEY", None)
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_ENABLED", "auto")

    with TestClient(app) as client:
        response = client.get("/api/v1/ai/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    data = payload["data"]
    assert data["provider"] == "deepseek"
    assert data["enabled"] is False
    assert data["configured"] is False
    assert data["api_key_masked"] is None
    assert "DEEPSEEK_API_KEY is not configured" in data["message"]


def test_ai_status_masks_key(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_API_KEY", "sk-1234567890abcd")
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_ENABLED", "auto")

    with TestClient(app) as client:
        response = client.get("/api/v1/ai/status")

    data = response.json()["data"]
    assert data["enabled"] is True
    assert data["configured"] is True
    assert data["api_key_masked"] == "sk-****abcd"
    assert "sk-1234567890abcd" not in str(data)


def test_ai_test_requires_admin():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/ai/test",
            headers={"X-WebGuard-User": "guest", "X-WebGuard-Role": "user"},
            json={
                "title": "登录验证",
                "visible_text": "账号异常，请输入验证码。",
                "url": "https://example-login.test/verify",
                "has_password_input": True,
            },
        )

    assert response.status_code == 403
    assert response.json()["code"] == 40301


def test_ai_test_returns_no_api_key_without_500(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_API_KEY", None)
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_ENABLED", "true")

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/ai/test",
            headers={"X-WebGuard-User": "admin", "X-WebGuard-Role": "admin"},
            json={
                "title": "登录验证",
                "visible_text": "您的账号存在异常，请立即输入验证码完成验证",
                "url": "https://example-login.test/verify",
                "has_password_input": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    assert payload["data"]["status"] == "no_api_key"
    assert payload["data"]["analysis"]["status"] == "no_api_key"
    assert "sk-" not in str(payload)
