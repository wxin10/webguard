from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import DomainBlacklist as DomainBlacklistModel
from ..schemas import ApiResponse, DomainBlacklist, DomainBlacklistCreate, DomainList
from .user import normalize_domain

router = APIRouter(prefix="/api/v1/blacklist", tags=["blacklist"])


@router.get("", response_model=ApiResponse[DomainList])
def get_blacklist(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(DomainBlacklistModel)
    if status:
        query = query.filter(DomainBlacklistModel.status == status)
    total = query.count()
    items = query.order_by(desc(DomainBlacklistModel.added_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": total,
            "items": [DomainBlacklist.model_validate(item) for item in items],
        },
    }


@router.post("", response_model=ApiResponse[DomainBlacklist])
def add_blacklist(request: DomainBlacklistCreate, db: Session = Depends(get_db)):
    domain = normalize_domain(request.domain)
    existing = db.query(DomainBlacklistModel).filter(DomainBlacklistModel.domain == domain).first()
    if existing:
        existing.reason = request.reason
        existing.risk_type = request.risk_type
        existing.source = request.source or "admin"
        existing.status = request.status or "active"
        db.commit()
        db.refresh(existing)
        return {"code": 0, "message": "success", "data": DomainBlacklist.model_validate(existing)}

    blacklist = DomainBlacklistModel(
        domain=domain,
        reason=request.reason,
        risk_type=request.risk_type,
        source=request.source or "admin",
        status=request.status or "active",
    )
    db.add(blacklist)
    db.commit()
    db.refresh(blacklist)
    return {"code": 0, "message": "success", "data": DomainBlacklist.model_validate(blacklist)}


@router.delete("/{blacklist_id}", response_model=ApiResponse[dict])
def delete_blacklist(blacklist_id: int, db: Session = Depends(get_db)):
    blacklist = db.query(DomainBlacklistModel).filter(DomainBlacklistModel.id == blacklist_id).first()
    if not blacklist:
        return {"code": 404, "message": "黑名单记录不存在", "data": None}
    blacklist.status = "disabled"
    db.commit()
    return {"code": 0, "message": "success", "data": {"id": blacklist_id, "status": "disabled"}}
