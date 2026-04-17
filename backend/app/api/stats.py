from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..core import get_db
from ..schemas import ApiResponse, FeedbackTrend, OverviewStats, RiskDistribution, SourceDistribution, TrendStats
from ..services import StatsService
from ..services.platform_service import PlatformService

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/overview", response_model=ApiResponse[OverviewStats])
def get_stats_overview(db: Session = Depends(get_db)):
    """获取概览统计"""
    stats_service = StatsService(db)
    overview = stats_service.get_overview()
    overview.update(PlatformService(db).platform_overview())
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


@router.get("/source-distribution", response_model=ApiResponse[SourceDistribution])
def get_source_distribution(db: Session = Depends(get_db)):
    distribution = PlatformService(db).source_distribution()
    return {
        "code": 0,
        "message": "success",
        "data": {
            "manual": distribution.get("manual", 0),
            "plugin": distribution.get("plugin", 0),
            "web": distribution.get("web", 0),
            "recheck": distribution.get("recheck", 0),
            "unknown": distribution.get("unknown", 0),
            "distribution": distribution,
        },
    }


@router.get("/feedback-trend", response_model=ApiResponse[FeedbackTrend])
def get_feedback_trend(days: int = Query(7, ge=1, le=30), db: Session = Depends(get_db)):
    return {
        "code": 0,
        "message": "success",
        "data": {"trend": PlatformService(db).feedback_trend(days)},
    }
