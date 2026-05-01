from typing import Any, List

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
