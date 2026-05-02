from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import get_db
from app.core.crypto import decrypt_secret
from app.core.database import Base
from app.main import app
from app.models import AIProviderConfig
from app.services.ai_config_service import AIConfigService


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


def admin_headers():
    return {"X-WebGuard-User": "admin", "X-WebGuard-Role": "admin"}


def user_headers():
    return {"X-WebGuard-User": "guest", "X-WebGuard-Role": "user"}


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def install_app_db_override():
    app.dependency_overrides[get_db] = override_get_db


def remove_app_db_override():
    app.dependency_overrides.pop(get_db, None)


def test_admin_can_get_ai_config(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_API_KEY", "env-test-key")
    reset_db()
    install_app_db_override()
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/ai/config", headers=admin_headers())
    finally:
        remove_app_db_override()

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["provider"] == "deepseek"
    assert data["configured"] is True
    assert data["source"] == "env"
    assert "env-test-key" not in str(response.json())


def test_user_cannot_update_ai_config():
    reset_db()
    install_app_db_override()
    try:
        with TestClient(app) as client:
            response = client.put(
                "/api/v1/ai/config",
                headers=user_headers(),
                json={
                    "enabled": True,
                    "base_url": "https://api.deepseek.example",
                    "model": "deepseek-chat",
                    "timeout_seconds": 20,
                    "api_key": "user-test-key",
                },
            )
    finally:
        remove_app_db_override()

    assert response.status_code == 403
    assert response.json()["code"] == 40301


def test_admin_update_config_encrypts_and_masks_key():
    reset_db()
    install_app_db_override()
    try:
        with TestClient(app) as client:
            response = client.put(
                "/api/v1/ai/config",
                headers=admin_headers(),
                json={
                    "enabled": True,
                    "base_url": "https://api.deepseek.example",
                    "model": "deepseek-chat",
                    "timeout_seconds": 30,
                    "api_key": "test-secret-123456",
                },
            )
        db = TestingSessionLocal()
        try:
            saved = db.query(AIProviderConfig).filter(AIProviderConfig.provider == "deepseek").first()
            assert saved is not None
            assert saved.encrypted_api_key != "test-secret-123456"
            assert decrypt_secret(saved.encrypted_api_key) == "test-secret-123456"
            assert saved.api_key_masked == "tes****3456"
        finally:
            db.close()
    finally:
        remove_app_db_override()

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["source"] == "database"
    assert data["api_key_masked"] == "tes****3456"
    assert "test-secret-123456" not in str(response.json())
    assert "encrypted_api_key" not in str(response.json())


def test_database_config_takes_precedence_over_env(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_API_KEY", "env-test-key")
    reset_db()
    db = TestingSessionLocal()
    try:
        service = AIConfigService(db)
        service.update_config_by_admin(
            request=_update_request(api_key="db-test-key", base_url="https://db.example", model="db-model"),
            username="admin",
        )
        effective = service.get_effective_config()
        analysis_service = service.build_analysis_service()
        assert effective.source == "database"
        assert effective.api_key == "db-test-key"
        assert analysis_service.api_key == "db-test-key"
        assert analysis_service.base_url == "https://db.example"
        assert analysis_service.model == "db-model"
    finally:
        db.close()


def test_clear_key_falls_back_to_env(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_API_KEY", "env-test-key")
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_BASE_URL", "https://env.example")
    reset_db()
    db = TestingSessionLocal()
    try:
        service = AIConfigService(db)
        service.update_config_by_admin(
            request=_update_request(api_key="db-test-key", base_url="https://db.example", model="db-model"),
            username="admin",
        )
        cleared = service.clear_api_key("admin")
        saved = db.query(AIProviderConfig).filter(AIProviderConfig.provider == "deepseek").first()
        assert saved is not None
        assert saved.encrypted_api_key is None
        assert saved.api_key_masked is None
        assert cleared["source"] == "env"
        assert cleared["configured"] is True
        assert cleared["base_url"] == "https://env.example"
    finally:
        db.close()


def test_status_does_not_leak_full_key(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.DEEPSEEK_API_KEY", "env-test-key")
    reset_db()
    install_app_db_override()
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/ai/status")
    finally:
        remove_app_db_override()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["api_key_masked"] == "env****-key"
    assert body["data"]["source"] == "env"
    assert "env-test-key" not in str(body)


def test_config_test_success_saves_last_test_status(monkeypatch):
    def fake_analyze(self, **_kwargs):
        return {
            "status": "used",
            "provider": "deepseek",
            "model": self.model,
            "risk_score": 71.0,
            "label": "suspicious",
            "risk_types": ["phishing"],
            "reasons": ["test reason"],
            "recommendation": "test recommendation",
            "confidence": 0.88,
            "error": None,
            "trigger_reasons": ["behavior_score>=25"],
        }

    monkeypatch.setattr("app.services.deepseek_analysis_service.DeepSeekAnalysisService.analyze", fake_analyze)
    reset_db()
    install_app_db_override()
    try:
        with TestClient(app) as client:
            client.put(
                "/api/v1/ai/config",
                headers=admin_headers(),
                json={
                    "enabled": True,
                    "base_url": "https://api.deepseek.example",
                    "model": "deepseek-chat",
                    "timeout_seconds": 20,
                    "api_key": "test-secret-123456",
                },
            )
            response = client.post("/api/v1/ai/config/test", headers=admin_headers(), json={})
            config_response = client.get("/api/v1/ai/config", headers=admin_headers())
    finally:
        remove_app_db_override()

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "used"
    assert data["analysis"]["risk_score"] == 71.0
    assert data["analysis"]["label"] == "suspicious"
    config = config_response.json()["data"]
    assert config["last_test_status"] == "used"
    assert config["last_test_message"] == "DeepSeek test succeeded"
    assert config["last_test_at"]


def _update_request(api_key: str, base_url: str = "https://api.deepseek.example", model: str = "deepseek-chat"):
    from app.schemas import AIConfigUpdateRequest

    return AIConfigUpdateRequest(
        enabled=True,
        base_url=base_url,
        model=model,
        timeout_seconds=20,
        api_key=api_key,
    )
