from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import DomainWhitelist as DomainWhitelistModel
from ..schemas import ApiResponse, DomainList, DomainWhitelist, DomainWhitelistCreate
from .user import normalize_domain

router = APIRouter(prefix="/api/v1/whitelist", tags=["whitelist"])


@router.get("", response_model=ApiResponse[DomainList])
def get_whitelist(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(DomainWhitelistModel)
    if status:
        query = query.filter(DomainWhitelistModel.status == status)
    total = query.count()
    items = query.order_by(desc(DomainWhitelistModel.added_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": total,
            "items": [DomainWhitelist.model_validate(item) for item in items],
        },
    }


@router.post("", response_model=ApiResponse[DomainWhitelist])
def add_whitelist(request: DomainWhitelistCreate, db: Session = Depends(get_db)):
    domain = normalize_domain(request.domain)
    existing = db.query(DomainWhitelistModel).filter(DomainWhitelistModel.domain == domain).first()
    if existing:
        existing.reason = request.reason
        existing.source = request.source or "admin"
        existing.status = request.status or "active"
        db.commit()
        db.refresh(existing)
        return {"code": 0, "message": "success", "data": DomainWhitelist.model_validate(existing)}

    whitelist = DomainWhitelistModel(
        domain=domain,
        reason=request.reason,
        source=request.source or "admin",
        status=request.status or "active",
    )
    db.add(whitelist)
    db.commit()
    db.refresh(whitelist)
    return {"code": 0, "message": "success", "data": DomainWhitelist.model_validate(whitelist)}


@router.delete("/{whitelist_id}", response_model=ApiResponse[dict])
def delete_whitelist(whitelist_id: int, db: Session = Depends(get_db)):
    whitelist = db.query(DomainWhitelistModel).filter(DomainWhitelistModel.id == whitelist_id).first()
    if not whitelist:
        return {"code": 404, "message": "白名单记录不存在", "data": None}
    whitelist.status = "disabled"
    db.commit()
    return {"code": 0, "message": "success", "data": {"id": whitelist_id, "status": "disabled"}}
