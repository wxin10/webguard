from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..core import get_db
from ..schemas import OverviewStats, TrendStats, RiskDistribution, ApiResponse
from ..services import StatsService

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/overview", response_model=ApiResponse[OverviewStats])
def get_stats_overview(db: Session = Depends(get_db)):
    """获取概览统计"""
    stats_service = StatsService(db)
    overview = stats_service.get_overview()
    return {
        "code": 0,
        "message": "success",
        "data": overview
    }


@router.get("/trend", response_model=ApiResponse[TrendStats])
def get_stats_trend(
    days: int = Query(7, ge=1, le=30, description="天数"),
    db: Session = Depends(get_db)
):
    """获取趋势统计"""
    stats_service = StatsService(db)
    trend = stats_service.get_trend(days=days)
    return {
        "code": 0,
        "message": "success",
        "data": {"trend": trend}
    }


@router.get("/risk-distribution", response_model=ApiResponse[RiskDistribution])
def get_risk_distribution(db: Session = Depends(get_db)):
    """获取风险分布"""
    stats_service = StatsService(db)
    distribution = stats_service.get_risk_distribution()
    return {
        "code": 0,
        "message": "success",
        "data": distribution
    }
