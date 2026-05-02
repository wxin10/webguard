from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import InvalidToken
from sqlalchemy.orm import Session

from ..core import settings
from ..core.crypto import decrypt_secret, encrypt_secret, mask_secret
from ..core.exceptions import WebGuardException
from ..models import AIProviderConfig
from ..schemas import AIConfigTestRequest, AIConfigUpdateRequest
from .deepseek_analysis_service import DeepSeekAnalysisService
from .feature_extractor import FeatureExtractor


@dataclass(frozen=True)
class EffectiveAIConfig:
    provider: str
    enabled: bool
    configured: bool
    base_url: str
    model: str
    timeout_seconds: int
    api_key: str | None
    api_key_masked: str | None
    source: str
    mode: str = "semantic_risk_analysis"
    message: str | None = None
    last_test_status: str | None = None
    last_test_message: str | None = None
    last_test_at: datetime | None = None

    def public_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "enabled": self.enabled,
            "configured": self.configured,
            "base_url": self.base_url,
            "model": self.model,
            "timeout_seconds": self.timeout_seconds,
            "api_key_masked": self.api_key_masked,
            "source": self.source,
            "mode": self.mode,
            "message": self.message,
            "last_test_status": self.last_test_status,
            "last_test_message": self.last_test_message,
            "last_test_at": self.last_test_at,
        }


class AIConfigService:
    provider = "deepseek"

    def __init__(self, db: Session):
        self.db = db

    def get_effective_config(self) -> EffectiveAIConfig:
        config = self._get_config()
        if config and config.encrypted_api_key:
            api_key = self._decrypt_api_key(config)
            enabled = bool(config.enabled)
            configured = bool(api_key)
            message = None if configured and enabled else self._message(enabled, configured)
            return EffectiveAIConfig(
                provider=config.provider,
                enabled=enabled,
                configured=configured,
                base_url=config.base_url,
                model=config.model,
                timeout_seconds=int(config.timeout_seconds or 20),
                api_key=api_key,
                api_key_masked=config.api_key_masked,
                source="database",
                message=message,
                last_test_status=config.last_test_status,
                last_test_message=config.last_test_message,
                last_test_at=config.last_test_at,
            )
        return self._env_config(config)

    def get_admin_config(self) -> dict[str, Any]:
        return self.get_effective_config().public_dict()

    def update_config_by_admin(self, request: AIConfigUpdateRequest, username: str) -> dict[str, Any]:
        config = self._get_or_create_config()
        config.enabled = request.enabled
        config.base_url = request.base_url
        config.model = request.model
        config.timeout_seconds = request.timeout_seconds
        config.updated_by = username
        if request.api_key is not None and request.api_key.strip():
            api_key = request.api_key.strip()
            config.encrypted_api_key = encrypt_secret(api_key)
            config.api_key_masked = mask_secret(api_key)
        self.db.add(config)
        self.db.commit()
        return self.get_effective_config().public_dict()

    def clear_api_key(self, username: str) -> dict[str, Any]:
        config = self._get_or_create_config()
        config.encrypted_api_key = None
        config.api_key_masked = None
        config.updated_by = username
        self.db.add(config)
        self.db.commit()
        return self.get_effective_config().public_dict()

    def test_config(self, request: AIConfigTestRequest | None = None, *, username: str, save_result: bool = True) -> dict[str, Any]:
        effective = self.get_effective_config()
        request = request or AIConfigTestRequest()
        config = self._merge_temporary_config(effective, request)
        features = FeatureExtractor.extract_features(
            request.url,
            request.title,
            request.visible_text,
            request.button_texts,
            request.input_labels,
            request.form_action_domains,
            request.has_password_input,
        )
        behavior_signals = [
            {
                "rule_key": "password_field",
                "rule_name": "检测到密码输入框",
                "matched": bool(request.has_password_input),
                "severity": "low",
                "category": "page",
                "score": 7.0 if request.has_password_input else 0.0,
                "reason": "页面包含密码输入框。" if request.has_password_input else "测试样本未包含密码输入框。",
            }
        ]
        behavior_score = 35.0 if request.has_password_input else 25.0
        analysis = DeepSeekAnalysisService(
            api_key=config["api_key"],
            base_url=config["base_url"],
            model=config["model"],
            enabled=config["enabled"],
            timeout_seconds=config["timeout_seconds"],
        ).analyze(
            features=features,
            behavior_score=behavior_score,
            behavior_signals=behavior_signals,
            threat_intel_hit=False,
        )
        status = str(analysis.get("status", "error"))
        message = "DeepSeek test succeeded" if status == "used" else str(analysis.get("reason") or analysis.get("error") or status)
        if save_result:
            self._save_test_result(status=status, message=message, username=username)
        return {"status": status, "analysis": analysis, "provider": self.provider}

    def build_analysis_service(self) -> DeepSeekAnalysisService:
        config = self.get_effective_config()
        return DeepSeekAnalysisService(
            api_key=config.api_key,
            base_url=config.base_url,
            model=config.model,
            enabled=config.enabled,
            timeout_seconds=config.timeout_seconds,
        )

    def _get_config(self) -> AIProviderConfig | None:
        return self.db.query(AIProviderConfig).filter(AIProviderConfig.provider == self.provider).first()

    def _get_or_create_config(self) -> AIProviderConfig:
        config = self._get_config()
        if config:
            return config
        config = AIProviderConfig(
            provider=self.provider,
            enabled=settings.deepseek_enabled,
            base_url=settings.DEEPSEEK_BASE_URL.rstrip("/"),
            model=settings.DEEPSEEK_MODEL,
            timeout_seconds=int(settings.DEEPSEEK_TIMEOUT_SECONDS or 20),
        )
        self.db.add(config)
        self.db.flush()
        return config

    def _decrypt_api_key(self, config: AIProviderConfig) -> str | None:
        if not config.encrypted_api_key:
            return None
        try:
            return decrypt_secret(config.encrypted_api_key)
        except InvalidToken as exc:
            raise WebGuardException(status_code=500, detail="AI provider API key cannot be decrypted", code=50001) from exc

    def _env_config(self, config: AIProviderConfig | None) -> EffectiveAIConfig:
        api_key = (settings.DEEPSEEK_API_KEY or "").strip() or None
        enabled = settings.deepseek_enabled
        configured = bool(api_key)
        return EffectiveAIConfig(
            provider=self.provider,
            enabled=enabled,
            configured=configured,
            base_url=settings.DEEPSEEK_BASE_URL.rstrip("/"),
            model=settings.DEEPSEEK_MODEL,
            timeout_seconds=int(settings.DEEPSEEK_TIMEOUT_SECONDS or 20),
            api_key=api_key,
            api_key_masked=settings.deepseek_api_key_masked,
            source="env",
            message=self._message(enabled, configured),
            last_test_status=config.last_test_status if config else None,
            last_test_message=config.last_test_message if config else None,
            last_test_at=config.last_test_at if config else None,
        )

    def _message(self, enabled: bool, configured: bool) -> str | None:
        if not configured:
            return "DEEPSEEK_API_KEY is not configured; detection falls back to rule engine only."
        if not enabled:
            return "DeepSeek semantic analysis is disabled; detection falls back to rule engine only."
        return None

    def _merge_temporary_config(self, effective: EffectiveAIConfig, request: AIConfigTestRequest) -> dict[str, Any]:
        api_key = request.api_key.strip() if request.api_key and request.api_key.strip() else effective.api_key
        return {
            "api_key": api_key,
            "base_url": request.base_url or effective.base_url,
            "model": request.model or effective.model,
            "enabled": effective.enabled if request.enabled is None else request.enabled,
            "timeout_seconds": request.timeout_seconds or effective.timeout_seconds,
        }

    def _save_test_result(self, *, status: str, message: str, username: str) -> None:
        config = self._get_or_create_config()
        config.last_test_status = status
        config.last_test_message = message
        config.last_test_at = datetime.now(timezone.utc)
        config.updated_by = username
        self.db.add(config)
        self.db.commit()
