from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import Principal, ok, principal_from_headers
from ..models import ScanRecord as ScanRecordModel
from ..schemas import ApiResponse, ScanRecord, ScanRecordList
from ..services.user_service import UserService

router = APIRouter(prefix="/api/v1/records", tags=["records"])


def _record_page(query, page: int, page_size: int):
    total = query.count()
    records = query.order_by(desc(ScanRecordModel.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "records": [ScanRecord.model_validate(record) for record in records],
    }


def _apply_filters(query, label: str | None, source: str | None, q: str | None):
    if label:
        query = query.filter(ScanRecordModel.label == label)
    if source:
        query = query.filter(ScanRecordModel.source == source)
    if q:
        keyword = f"%{q}%"
        query = query.filter((ScanRecordModel.url.like(keyword)) | (ScanRecordModel.domain.like(keyword)))
    return query


@router.get("", response_model=ApiResponse[ScanRecordList])
def get_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    label: str | None = Query(default=None),
    source: str | None = Query(default=None),
    q: str | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    query = db.query(ScanRecordModel)
    if not principal.is_admin:
        user = UserService(db).get_or_create_user(principal.username)
        query = query.filter((ScanRecordModel.user_id == user.id) | (ScanRecordModel.user_id.is_(None)))
    query = _apply_filters(query, label, source, q)
    return ok(_record_page(query, page, page_size))


@router.get("/me", response_model=ApiResponse[ScanRecordList])
def get_my_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    label: str | None = Query(default=None),
    source: str | None = Query(default=None),
    q: str | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    user = UserService(db).get_or_create_user(principal.username)
    query = db.query(ScanRecordModel).filter(
        (ScanRecordModel.user_id == user.id) | (ScanRecordModel.user_id.is_(None))
    ).filter(ScanRecordModel.source.in_(["plugin", "manual", "web", "recheck"]))
    query = _apply_filters(query, label, source, q)
    return ok(_record_page(query, page, page_size))


@router.get("/{record_id}", response_model=ApiResponse[ScanRecord])
def get_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(ScanRecordModel).filter(ScanRecordModel.id == record_id).first()
    if not record:
        return {"success": False, "code": 404, "message": "记录不存在", "data": None}
    return ok(ScanRecord.model_validate(record))
