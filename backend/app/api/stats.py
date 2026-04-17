from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import ok
from ..schemas import ApiResponse, FeedbackTrend, OverviewStats, RiskDistribution, SourceDistribution, TrendStats
from ..services import StatsService

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/overview", response_model=ApiResponse[OverviewStats])
def get_stats_overview(db: Session = Depends(get_db)):
    return ok(StatsService(db).get_platform_overview())


@router.get("/trend", response_model=ApiResponse[TrendStats])
def get_stats_trend(
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    return ok({"trend": StatsService(db).get_trend(days=days)})


@router.get("/risk-distribution", response_model=ApiResponse[RiskDistribution])
def get_risk_distribution(db: Session = Depends(get_db)):
    return ok(StatsService(db).get_risk_distribution())


@router.get("/source-distribution", response_model=ApiResponse[SourceDistribution])
def get_source_distribution(db: Session = Depends(get_db)):
    distribution = StatsService(db).get_source_distribution()
    return ok(
        {
            "manual": distribution.get("manual", 0),
            "plugin": distribution.get("plugin", 0),
            "web": distribution.get("web", 0),
            "recheck": distribution.get("recheck", 0),
            "unknown": distribution.get("unknown", 0),
            "distribution": distribution,
        }
    )


@router.get("/feedback-trend", response_model=ApiResponse[FeedbackTrend])
def get_feedback_trend(days: int = Query(7, ge=1, le=30), db: Session = Depends(get_db)):
    return ok({"trend": StatsService(db).get_feedback_trend(days)})
