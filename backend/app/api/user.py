from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import UserSiteStrategy as UserSiteStrategyModel
from ..schemas import ApiResponse, UserSiteStrategyCreate, UserSiteStrategyItem, UserStrategyOverview


router = APIRouter(prefix="/api/v1/user", tags=["user-strategies"])


def current_username(x_webguard_user: str | None = Header(default=None)) -> str:
    return (x_webguard_user or "platform-user").strip() or "platform-user"


def normalize_domain(value: str) -> str:
    raw = value.strip().lower()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.hostname or raw).replace("www.", "", 1)


def active_query(db: Session, username: str):
    now = datetime.now(timezone.utc)
    return db.query(UserSiteStrategyModel).filter(
        UserSiteStrategyModel.username == username,
        UserSiteStrategyModel.is_active.is_(True),
    ).filter(
        (UserSiteStrategyModel.expires_at.is_(None)) | (UserSiteStrategyModel.expires_at > now)
    )


def upsert_strategy(
    db: Session,
    username: str,
    strategy_type: str,
    request: UserSiteStrategyCreate,
):
    domain = normalize_domain(request.domain)
    existing = db.query(UserSiteStrategyModel).filter(
        UserSiteStrategyModel.username == username,
        UserSiteStrategyModel.domain == domain,
        UserSiteStrategyModel.strategy_type == strategy_type,
    ).first()
    expires_at = None
    if strategy_type == "paused":
        minutes = request.minutes or 30
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes)

    if existing:
        existing.reason = request.reason
        existing.source = request.source or "web"
        existing.expires_at = expires_at
        existing.is_active = True
        strategy = existing
    else:
        strategy = UserSiteStrategyModel(
            username=username,
            domain=domain,
            strategy_type=strategy_type,
            reason=request.reason,
            source=request.source or "web",
            expires_at=expires_at,
        )
        db.add(strategy)

    if strategy_type in ("trusted", "blocked"):
        opposite = "blocked" if strategy_type == "trusted" else "trusted"
        db.query(UserSiteStrategyModel).filter(
            UserSiteStrategyModel.username == username,
            UserSiteStrategyModel.domain == domain,
            UserSiteStrategyModel.strategy_type == opposite,
        ).update({"is_active": False})
        db.query(UserSiteStrategyModel).filter(
            UserSiteStrategyModel.username == username,
            UserSiteStrategyModel.domain == domain,
            UserSiteStrategyModel.strategy_type == "paused",
        ).update({"is_active": False})

    db.commit()
    db.refresh(strategy)
    return strategy


@router.get("/strategies", response_model=ApiResponse[UserStrategyOverview])
def get_user_strategies(
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    items = active_query(db, username).order_by(UserSiteStrategyModel.updated_at.desc()).all()
    data = {
        "trusted_sites": [UserSiteStrategyItem.model_validate(item) for item in items if item.strategy_type == "trusted"],
        "blocked_sites": [UserSiteStrategyItem.model_validate(item) for item in items if item.strategy_type == "blocked"],
        "paused_sites": [UserSiteStrategyItem.model_validate(item) for item in items if item.strategy_type == "paused"],
    }
    return {"code": 0, "message": "success", "data": data}


@router.post("/trusted-sites", response_model=ApiResponse[UserSiteStrategyItem])
def add_trusted_site(
    request: UserSiteStrategyCreate,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    strategy = upsert_strategy(db, username, "trusted", request)
    return {"code": 0, "message": "success", "data": UserSiteStrategyItem.model_validate(strategy)}


@router.post("/blocked-sites", response_model=ApiResponse[UserSiteStrategyItem])
def add_blocked_site(
    request: UserSiteStrategyCreate,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    strategy = upsert_strategy(db, username, "blocked", request)
    return {"code": 0, "message": "success", "data": UserSiteStrategyItem.model_validate(strategy)}


@router.post("/site-actions/pause", response_model=ApiResponse[UserSiteStrategyItem])
def pause_site(
    request: UserSiteStrategyCreate,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    strategy = upsert_strategy(db, username, "paused", request)
    return {"code": 0, "message": "success", "data": UserSiteStrategyItem.model_validate(strategy)}


@router.post("/site-actions/resume", response_model=ApiResponse[dict])
def resume_site(
    request: UserSiteStrategyCreate,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    domain = normalize_domain(request.domain)
    db.query(UserSiteStrategyModel).filter(
        UserSiteStrategyModel.username == username,
        UserSiteStrategyModel.domain == domain,
        UserSiteStrategyModel.strategy_type == "paused",
    ).update({"is_active": False})
    db.commit()
    return {"code": 0, "message": "success", "data": {"domain": domain, "resumed": True}}


@router.delete("/trusted-sites/{strategy_id}", response_model=ApiResponse[dict])
def delete_trusted_site(strategy_id: int, username: str = Depends(current_username), db: Session = Depends(get_db)):
    return delete_strategy(strategy_id, username, "trusted", db)


@router.delete("/blocked-sites/{strategy_id}", response_model=ApiResponse[dict])
def delete_blocked_site(strategy_id: int, username: str = Depends(current_username), db: Session = Depends(get_db)):
    return delete_strategy(strategy_id, username, "blocked", db)


def delete_strategy(strategy_id: int, username: str, strategy_type: str, db: Session):
    strategy = db.query(UserSiteStrategyModel).filter(
        UserSiteStrategyModel.id == strategy_id,
        UserSiteStrategyModel.username == username,
        UserSiteStrategyModel.strategy_type == strategy_type,
    ).first()
    if not strategy:
        return {"code": 404, "message": "策略不存在", "data": None}
    strategy.is_active = False
    db.commit()
    return {"code": 0, "message": "删除成功", "data": None}
