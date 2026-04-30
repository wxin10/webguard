from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


def normalize_scan_url(value: str) -> str:
    normalized = value.strip()
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("invalid url format")
    return normalized


def normalize_text_list(values: List[str]) -> List[str]:
    return [value.strip() for value in values if isinstance(value, str) and value.strip()]


class UrlScanRequest(BaseModel):
    url: str = Field(..., description="URL to scan")

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_scan_url(value)


class PageScanRequest(BaseModel):
    url: str = Field(..., description="Page URL")
    title: str = Field("", description="Page title", max_length=256)
    visible_text: str = Field("", description="Visible text")
    button_texts: List[str] = Field(default_factory=list, description="Button texts")
    input_labels: List[str] = Field(default_factory=list, description="Input labels")
    form_action_domains: List[str] = Field(default_factory=list, description="Form action domains")
    has_password_input: bool = Field(False, description="Whether the page has a password input")
    source: str = Field("manual", description="Scan source")

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_scan_url(value)

    @field_validator("button_texts", "input_labels", "form_action_domains")
    @classmethod
    def validate_text_lists(cls, value: List[str]) -> List[str]:
        return normalize_text_list(value)


class HitRule(BaseModel):
    rule_key: str
    rule_name: str
    matched: bool
    raw_score: float
    weighted_score: float
    detail: Optional[str] = None
    name: Optional[str] = None
    enabled: Optional[bool] = None
    weight: Optional[float] = None
    threshold: Optional[float] = None
    contribution: Optional[float] = None
    reason: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    raw_feature: Optional[Dict[str, Any]] = None


class ScanResult(BaseModel):
    url: str
    domain: str
    label: str
    risk_score: float
    summary: str
    reason_summary: List[str] = Field(default_factory=list)
    action: Literal["ALLOW", "WARN", "BLOCK"]
    should_warn: bool
    should_block: bool
    rule_score: float
    model_safe_prob: float
    model_suspicious_prob: float
    model_malicious_prob: float
    hit_rules: List[HitRule]
    policy_hit: Dict[str, Any] = Field(default_factory=dict)
    threat_intel_hit: bool = False
    threat_intel_matches: List[Dict[str, Any]] = Field(default_factory=list)
    behavior_score: float = 0.0
    behavior_signals: List[Dict[str, Any]] = Field(default_factory=list)
    ai_score: Optional[float] = None
    ai_analysis: Dict[str, Any] = Field(default_factory=dict)
    score_breakdown: Optional[Dict[str, Any]] = None
    explanation: str
    recommendation: str
    record_id: int
    report_id: Optional[int] = None
