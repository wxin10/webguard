from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import Principal, fail, ok, principal_from_headers
from ..models import ReportAction as ReportActionModel
from ..schemas import (
    ApiResponse,
    FeedbackCaseCreate,
    FeedbackCaseItem,
    FeedbackCaseList,
    PluginEventStats,
    PluginPolicyBundle,
    PluginSyncEventCreate,
    PluginSyncEventItem,
    PluginSyncEventList,
    ScanResult,
)
from ..services.domain_service import normalize_domain
from ..services.feedback_service import FeedbackService
from ..services.plugin_event_service import PluginEventService
from ..services.policy_service import PolicyService
from ..services.report_service import ReportService
from ..services.scan_service import ScanService

router = APIRouter(prefix="/api/v1/plugin", tags=["plugin"])


class AnalyzeCurrentRequest(BaseModel):
    url: str
    title: str = ""
    visible_text: str = ""
    button_texts: List[str] = Field(default_factory=list)
    input_labels: List[str] = Field(default_factory=list)
    form_action_domains: List[str] = Field(default_factory=list)
    has_password_input: bool = False


class FeedbackRequest(BaseModel):
    url: str
    feedback_type: str = "false_positive"
    comment: Optional[str] = None
    report_id: Optional[int] = None


class FeedbackCaseUpdate(BaseModel):
    status: str
    comment: Optional[str] = None


@router.get("/policy", response_model=ApiResponse[PluginPolicyBundle])
def get_plugin_policy(principal: Principal = Depends(principal_from_headers), db: Session = Depends(get_db)):
    return ok(PolicyService(db).plugin_policy(principal.username))


@router.get("/bootstrap")
def get_plugin_bootstrap(principal: Principal = Depends(principal_from_headers), db: Session = Depends(get_db)):
    return ok(PolicyService(db).plugin_bootstrap(principal.username))


@router.post("/analyze-current", response_model=ApiResponse[ScanResult])
def analyze_current(
    request: AnalyzeCurrentRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    result = ScanService(db).scan_page(
        {
            "url": request.url,
            "title": request.title,
            "visible_text": request.visible_text,
            "button_texts": request.button_texts,
            "input_labels": request.input_labels,
            "form_action_domains": request.form_action_domains,
            "has_password_input": request.has_password_input,
        },
        source="plugin",
        username=principal.username,
    )
    PluginEventService(db).record_event(
        principal.username,
        PluginSyncEventCreate(
            event_type="scan",
            url=request.url,
            domain=normalize_domain(request.url),
            risk_label=result.get("label"),
            risk_level=result.get("label"),
            risk_score=result.get("risk_score"),
            summary=result.get("explanation"),
            scan_record_id=result.get("record_id"),
            metadata={
                "title": request.title,
                "has_password_input": request.has_password_input,
                "form_action_domains": request.form_action_domains,
            },
        ),
    )
    return ok(result)


@router.post("/events", response_model=ApiResponse[PluginSyncEventItem])
def record_plugin_event(
    request: PluginSyncEventCreate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    event = PluginEventService(db).record_event(principal.username, request)
    return ok(PluginSyncEventItem.model_validate(event))


@router.get("/events", response_model=ApiResponse[PluginSyncEventList])
def get_plugin_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: str | None = Query(default=None),
    risk_label: str | None = Query(default=None),
    scan_record_id: int | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    total, events = PluginEventService(db).list_events(
        username=principal.username,
        role=principal.role,
        page=page,
        page_size=page_size,
        event_type=event_type,
        risk_label=risk_label,
        scan_record_id=scan_record_id,
    )
    return ok({"total": total, "events": [PluginSyncEventItem.model_validate(item) for item in events]})


@router.get("/stats", response_model=ApiResponse[PluginEventStats])
def get_plugin_stats(principal: Principal = Depends(principal_from_headers), db: Session = Depends(get_db)):
    return ok(PluginEventService(db).stats(principal.username, principal.role))


@router.post("/feedback", response_model=ApiResponse[dict])
def submit_feedback(
    request: FeedbackRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    feedback_service = FeedbackService(db)
    report_service = ReportService(db)
    case = feedback_service.create_case(
        principal.username,
        FeedbackCaseCreate(
            url=request.url,
            report_id=request.report_id,
            feedback_type=request.feedback_type,
            status="pending_review",
            comment=request.comment,
            source="plugin",
        ),
        report_service=report_service,
    )
    action = ReportActionModel(
        report_id=request.report_id or 0,
        actor=principal.username,
        actor_role=principal.role,
        action_type=request.feedback_type,
        status="pending_review",
        note=f"{request.url}\n{request.comment or ''}".strip(),
    )
    db.add(action)
    db.commit()
    PluginEventService(db).record_event(
        principal.username,
        PluginSyncEventCreate(
            event_type="feedback",
            action=request.feedback_type,
            url=request.url,
            domain=normalize_domain(request.url),
            scan_record_id=request.report_id,
            summary=request.comment,
            metadata={"feedback_case_id": case.id},
        ),
    )
    return ok({"case_id": case.id}, "feedback submitted")


@router.get("/feedback-cases", response_model=ApiResponse[FeedbackCaseList])
def get_feedback_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    total, cases = FeedbackService(db).list_cases(
        username=principal.username,
        role=principal.role,
        page=page,
        page_size=page_size,
        status=status,
    )
    return ok({"total": total, "cases": [FeedbackCaseItem.model_validate(item) for item in cases]})


@router.put("/feedback-cases/{case_id}", response_model=ApiResponse[FeedbackCaseItem])
def update_feedback_case(
    case_id: int,
    request: FeedbackCaseUpdate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    if not principal.is_admin:
        return fail("仅管理员可处理反馈案件", 403)
    case = FeedbackService(db).update_case(case_id, request.status, request.comment)
    if not case:
        return fail("反馈案件不存在", 404)
    return ok(FeedbackCaseItem.model_validate(case))
