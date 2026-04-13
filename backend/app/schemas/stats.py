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
