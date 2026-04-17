from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import Principal, fail, ok, principal_from_headers
from ..schemas import ApiResponse, FeedbackCaseCreate, ReportActionCreate, ReportActionItem, ScanRecordList
from ..services.domain_service import DomainService
from ..services.feedback_service import FeedbackService
from ..services.report_service import ReportService
from ..services.scan_service import ScanService


router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/actions/recent", response_model=ApiResponse[list[ReportActionItem]])
def get_recent_actions(db: Session = Depends(get_db)):
    actions = ReportService(db).recent_actions()
    return ok([ReportActionItem.model_validate(action) for action in actions])


@router.get("/latest", response_model=ApiResponse[dict])
def get_latest_report(
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    report = ReportService(db).latest_report(principal.username, principal.role)
    if not report:
        return fail("暂无检测报告", 404)
    return ok(report)


@router.get("/{report_id}", response_model=ApiResponse[dict])
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = ReportService(db).report_by_id(report_id)
    if not report:
        return fail("报告不存在", 404)
    return ok(report)


@router.get("/{report_id}/domain-history", response_model=ApiResponse[ScanRecordList])
def get_domain_history(report_id: int, db: Session = Depends(get_db)):
    data = ReportService(db).domain_history(report_id)
    if not data:
        return fail("报告不存在", 404)
    return ok(data)


@router.get("/{report_id}/actions", response_model=ApiResponse[list[ReportActionItem]])
def get_report_actions(report_id: int, db: Session = Depends(get_db)):
    actions = ReportService(db).report_actions(report_id)
    return ok([ReportActionItem.model_validate(action) for action in actions])


@router.post("/{report_id}/trust-domain", response_model=ApiResponse[ReportActionItem])
def trust_domain(
    report_id: int,
    request: ReportActionCreate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    report_service = ReportService(db)
    record = report_service.record_for_report_id(report_id)
    if not record:
        return fail("报告不存在", 404)
    owner_type = "global" if principal.is_admin or request.scope == "global" else "user"
    DomainService(db).create_domain(
        owner_type=owner_type,
        username=None if owner_type == "global" else principal.username,
        data={
            "host": record.domain,
            "list_type": "trusted",
            "reason": request.note or f"来自报告 #{report_id}",
            "source": "report",
        },
    )
    action = report_service.save_action(
        report_id=report_id,
        actor=principal.username,
        actor_role=principal.role,
        action_type="trust_domain",
        status=request.status or "submitted",
        note=request.note,
    )
    return ok(ReportActionItem.model_validate(action))


@router.post("/{report_id}/block-domain", response_model=ApiResponse[ReportActionItem])
def block_domain(
    report_id: int,
    request: ReportActionCreate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    report_service = ReportService(db)
    record = report_service.record_for_report_id(report_id)
    if not record:
        return fail("报告不存在", 404)
    owner_type = "global" if principal.is_admin or request.scope == "global" else "user"
    DomainService(db).create_domain(
        owner_type=owner_type,
        username=None if owner_type == "global" else principal.username,
        data={
            "host": record.domain,
            "list_type": "blocked",
            "reason": request.note or f"来自报告 #{report_id}",
            "source": "report",
        },
    )
    action = report_service.save_action(
        report_id=report_id,
        actor=principal.username,
        actor_role=principal.role,
        action_type="block_domain",
        status=request.status or "submitted",
        note=request.note,
    )
    return ok(ReportActionItem.model_validate(action))


@router.post("/{report_id}/mark-false-positive", response_model=ApiResponse[ReportActionItem])
def mark_false_positive(
    report_id: int,
    request: ReportActionCreate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    report_service = ReportService(db)
    record = report_service.record_for_report_id(report_id)
    if not record:
        return fail("报告不存在", 404)
    FeedbackService(db).create_case(
        principal.username,
        FeedbackCaseCreate(
            url=record.url,
            report_id=report_id,
            feedback_type="false_positive",
            status=request.status or "pending_review",
            content=request.note,
            comment=request.note,
            source="report",
        ),
        report_service=report_service,
    )
    action = report_service.save_action(
        report_id=report_id,
        actor=principal.username,
        actor_role=principal.role,
        action_type="mark_false_positive",
        status=request.status or "pending_review",
        note=request.note,
    )
    return ok(ReportActionItem.model_validate(action))


@router.post("/{report_id}/review", response_model=ApiResponse[ReportActionItem])
def review_report(
    report_id: int,
    request: ReportActionCreate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    report_service = ReportService(db)
    if not report_service.record_for_report_id(report_id):
        return fail("报告不存在", 404)
    action = report_service.save_action(
        report_id=report_id,
        actor=principal.username,
        actor_role=principal.role,
        action_type="review",
        status=request.status or "submitted",
        note=request.note,
    )
    return ok(ReportActionItem.model_validate(action))


@router.post("/{report_id}/recheck", response_model=ApiResponse[dict])
def recheck_report(
    report_id: int,
    request: ReportActionCreate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    report_service = ReportService(db)
    record = report_service.record_for_report_id(report_id)
    if not record:
        return fail("报告不存在", 404)
    result = ScanService(db).scan_url(record.url, source="recheck", username=principal.username)
    action = report_service.save_action(
        report_id=report_id,
        actor=principal.username,
        actor_role=principal.role,
        action_type="recheck",
        status=request.status or "submitted",
        note=request.note,
    )
    return ok({"action": ReportActionItem.model_validate(action), "result": result})
