from pydantic import BaseModel
from typing import Dict, List


class OverviewStats(BaseModel):
    """概览统计响应模式"""
    total_scans: int
    safe_count: int
    suspicious_count: int
    malicious_count: int
    today_scans: int


class TrendData(BaseModel):
    """趋势数据点"""
    date: str
    count: int
    safe_count: int
    suspicious_count: int
    malicious_count: int


class TrendStats(BaseModel):
    """趋势统计响应模式"""
    trend: List[TrendData]


class RiskDistribution(BaseModel):
    """风险分布响应模式"""
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
