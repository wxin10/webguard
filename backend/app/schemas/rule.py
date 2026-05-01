from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RuleConfigBase(BaseModel):
    rule_key: str
    rule_name: str
    name: Optional[str] = None
    description: Optional[str] = None
    category: str = "general"
    weight: float
    threshold: float
    enabled: bool = True
    severity: str = "medium"

    @field_validator("name", mode="before")
    @classmethod
    def default_name(cls, value: Optional[str], values: Any) -> Optional[str]:
        return value


class RuleConfigUpdate(BaseModel):
    weight: Optional[float] = Field(default=None, ge=0, le=100)
    threshold: Optional[float] = Field(default=None, ge=0)
    enabled: Optional[bool] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    rule_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    severity: Optional[str] = Field(default=None, pattern="^(low|medium|high|critical)$")
    category: Optional[str] = Field(default=None, max_length=50)


class RuleConfig(RuleConfigBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RuleStats(BaseModel):
    rule_id: Optional[int] = None
    rule_key: str
    recent_hits_7d: int
    recent_hit_rate_7d: float
    risk_hits_7d: int
    suspicious_hits_7d: int
    malicious_hits_7d: int
    false_positive_feedback_7d: int
    last_hit_at: Optional[datetime] = None
    false_positive_tendency: str


class RuleConfigWithStats(RuleConfig):
    stats: Optional[RuleStats] = None


class RuleConfigList(BaseModel):
    total: int
    rules: List[RuleConfigWithStats]


class RuleStatsList(BaseModel):
    total: int
    stats: List[RuleStats]


class ScoreRuleDetail(BaseModel):
    rule_key: str
    name: str
    matched: bool
    enabled: bool
    weight: float
    threshold: float
    contribution: float
    reason: str
    category: str
    severity: str
    raw_feature: Optional[Dict[str, Any]] = None


class ScoreBreakdown(BaseModel):
    rule_score_total: float
    rule_score_raw_total: Optional[float] = None
    enabled_rule_weight_total: Optional[float] = None
    behavior_score: float
    behavior_signals: List[Dict[str, Any]] = []
    ai_provider: str = "deepseek"
    ai_score: Optional[float] = None
    ai_analysis: Dict[str, Any] = {}
    ai_fusion_used: bool = False
    fallback: Optional[str] = None
    final_score: float
    label: str
    fusion_summary: str
    rules: List[Dict[str, Any]]
    raw_features: Dict[str, Any] = {}
