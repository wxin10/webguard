from datetime import datetime
from typing import Any, List
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from .scan import normalize_scan_url, normalize_text_list


class AIStatus(BaseModel):
    provider: str
    enabled: bool
    configured: bool
    base_url: str
    model: str
    timeout_seconds: int
    api_key_masked: str | None = None
    mode: str
    source: str = "env"
    message: str | None = None


class AITestRequest(BaseModel):
    title: str = Field("", max_length=256)
    visible_text: str = ""
    url: str
    has_password_input: bool = False
    button_texts: List[str] = Field(default_factory=list)
    input_labels: List[str] = Field(default_factory=list)
    form_action_domains: List[str] = Field(default_factory=list)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_scan_url(value)

    @field_validator("button_texts", "input_labels", "form_action_domains")
    @classmethod
    def validate_text_lists(cls, value: List[str]) -> List[str]:
        return normalize_text_list(value)


class AITestResponse(BaseModel):
    status: str
    analysis: dict[str, Any]
    provider: str = "deepseek"


def validate_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("base_url must be an http or https URL")
    return normalized


class AIConfig(BaseModel):
    provider: str = "deepseek"
    enabled: bool
    configured: bool
    base_url: str
    model: str
    timeout_seconds: int
    api_key_masked: str | None = None
    source: str
    mode: str = "semantic_risk_analysis"
    message: str | None = None
    last_test_status: str | None = None
    last_test_message: str | None = None
    last_test_at: datetime | None = None


class AIConfigUpdateRequest(BaseModel):
    enabled: bool
    base_url: str
    model: str = Field(..., min_length=1, max_length=255)
    timeout_seconds: int = Field(..., ge=5, le=120)
    api_key: str | None = None

    @field_validator("base_url")
    @classmethod
    def validate_config_base_url(cls, value: str) -> str:
        return validate_base_url(value)

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("model is required")
        return normalized


class AIConfigTestRequest(BaseModel):
    enabled: bool | None = None
    base_url: str | None = None
    model: str | None = Field(default=None, min_length=1, max_length=255)
    timeout_seconds: int | None = Field(default=None, ge=5, le=120)
    api_key: str | None = None
    title: str = Field("登录验证", max_length=256)
    visible_text: str = "您的账号存在异常，请立即输入验证码完成验证"
    url: str = "https://example-login.test/verify"
    has_password_input: bool = True
    button_texts: List[str] = Field(default_factory=lambda: ["立即验证"])
    input_labels: List[str] = Field(default_factory=lambda: ["账号", "密码", "验证码"])
    form_action_domains: List[str] = Field(default_factory=lambda: ["example-login.test"])

    @field_validator("base_url")
    @classmethod
    def validate_optional_base_url(cls, value: str | None) -> str | None:
        return validate_base_url(value) if value is not None else None

    @field_validator("model")
    @classmethod
    def validate_optional_model(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("model is required")
        return normalized

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_scan_url(value)

    @field_validator("button_texts", "input_labels", "form_action_domains")
    @classmethod
    def validate_text_lists(cls, value: List[str]) -> List[str]:
        return normalize_text_list(value)
