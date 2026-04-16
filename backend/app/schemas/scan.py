from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UrlScanRequest(BaseModel):
    url: str = Field(..., description="URL to scan")


class PageScanRequest(BaseModel):
    url: str = Field(..., description="Page URL")
    title: str = Field("", description="Page title")
    visible_text: str = Field("", description="Visible text")
    button_texts: List[str] = Field(default_factory=list, description="Button texts")
    input_labels: List[str] = Field(default_factory=list, description="Input labels")
    form_action_domains: List[str] = Field(default_factory=list, description="Form action domains")
    has_password_input: bool = Field(False, description="Whether the page has a password input")
    source: str = Field("manual", description="Scan source")


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
    label: str
    risk_score: float
    rule_score: float
    model_safe_prob: float
    model_suspicious_prob: float
    model_malicious_prob: float
    hit_rules: List[HitRule]
    score_breakdown: Optional[Dict[str, Any]] = None
    explanation: str
    recommendation: str
    record_id: int
