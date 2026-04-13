from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import ScanRecord as ScanRecordModel
from ..schemas import ApiResponse, ScanRecord, ScanRecordList


router = APIRouter(prefix="/api/v1/records", tags=["records"])


def _record_page(query, page: int, page_size: int):
    offset = (page - 1) * page_size
    total = query.count()
    records = query.order_by(desc(ScanRecordModel.created_at)).offset(offset).limit(page_size).all()
    return {
        "total": total,
        "records": [ScanRecord.model_validate(record) for record in records],
    }


@router.get("", response_model=ApiResponse[ScanRecordList])
def get_records(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
):
    return {
        "code": 0,
        "message": "success",
        "data": _record_page(db.query(ScanRecordModel), page, page_size),
    }


@router.get("/me", response_model=ApiResponse[ScanRecordList])
def get_my_records(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
):
    query = db.query(ScanRecordModel).filter(ScanRecordModel.source.in_(["plugin", "manual", "web"]))
    return {
        "code": 0,
        "message": "success",
        "data": _record_page(query, page, page_size),
    }


@router.get("/{record_id}", response_model=ApiResponse[ScanRecord])
def get_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(ScanRecordModel).filter(ScanRecordModel.id == record_id).first()
    if not record:
        return {"code": 404, "message": "记录不存在", "data": None}

    return {
        "code": 0,
        "message": "success",
        "data": ScanRecord.model_validate(record),
    }
