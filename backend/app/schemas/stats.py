from typing import Dict, List

from pydantic import BaseModel


class OverviewStats(BaseModel):
    total_scans: int
    high_risk_count: int = 0
    plugin_event_count: int = 0
    warning_count: int = 0
    bypass_count: int = 0
    trust_count: int = 0
    feedback_count: int = 0
    source_distribution: Dict[str, int] = {}
    safe_count: int
    suspicious_count: int
    malicious_count: int
    today_scans: int


class TrendData(BaseModel):
    date: str
    count: int
    safe_count: int
    suspicious_count: int
    malicious_count: int


class TrendStats(BaseModel):
    trend: List[TrendData]


class RiskDistribution(BaseModel):
    safe: int
    suspicious: int
    malicious: int
    distribution: Dict[str, float]


class SourceDistribution(BaseModel):
    manual: int = 0
    plugin: int = 0
    web: int = 0
    recheck: int = 0
    unknown: int = 0
    distribution: Dict[str, int]


class FeedbackTrendPoint(BaseModel):
    date: str
    count: int
    resolved_count: int


class FeedbackTrend(BaseModel):
    trend: List[FeedbackTrendPoint]
