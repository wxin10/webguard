from typing import List, Optional

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db
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
from ..services import Detector
from ..services.platform_service import PlatformService, normalize_domain

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


def current_username(x_webguard_user: str | None = Header(default=None)) -> str:
    return (x_webguard_user or "platform-user").strip() or "platform-user"


def current_role(x_webguard_role: str | None = Header(default=None)) -> str:
    return (x_webguard_role or "user").strip() or "user"


@router.get("/policy", response_model=ApiResponse[PluginPolicyBundle])
def get_plugin_policy(username: str = Depends(current_username), db: Session = Depends(get_db)):
    data = PlatformService(db).plugin_policy(username)
    return {"code": 0, "message": "success", "data": data}


@router.post("/analyze-current", response_model=ApiResponse[ScanResult])
def analyze_current(
    request: AnalyzeCurrentRequest,
    db: Session = Depends(get_db),
    username: str = Depends(current_username),
):
    detector = Detector(db)
    result = detector.detect_page(
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
        username=username,
    )
    PlatformService(db).record_plugin_event(
        username,
        PluginSyncEventCreate(
            event_type="scan",
            url=request.url,
            domain=normalize_domain(request.url),
            risk_label=result.get("label"),
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
    return {"code": 0, "message": "success", "data": result}


@router.post("/events", response_model=ApiResponse[PluginSyncEventItem])
def record_plugin_event(
    request: PluginSyncEventCreate,
    db: Session = Depends(get_db),
    username: str = Depends(current_username),
):
    event = PlatformService(db).record_plugin_event(username, request)
    return {"code": 0, "message": "success", "data": PluginSyncEventItem.model_validate(event)}


@router.get("/events", response_model=ApiResponse[PluginSyncEventList])
def get_plugin_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: str | None = Query(default=None),
    risk_label: str | None = Query(default=None),
    scan_record_id: int | None = Query(default=None),
    username: str = Depends(current_username),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    total, events = PlatformService(db).list_plugin_events(
        username=username,
        role=role,
        page=page,
        page_size=page_size,
        event_type=event_type,
        risk_label=risk_label,
        scan_record_id=scan_record_id,
    )
    return {
        "code": 0,
        "message": "success",
        "data": {"total": total, "events": [PluginSyncEventItem.model_validate(item) for item in events]},
    }


@router.get("/stats", response_model=ApiResponse[PluginEventStats])
def get_plugin_stats(
    username: str = Depends(current_username),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    return {"code": 0, "message": "success", "data": PlatformService(db).plugin_stats(username, role)}


@router.post("/feedback", response_model=ApiResponse[dict])
def submit_feedback(
    request: FeedbackRequest,
    db: Session = Depends(get_db),
    username: str = Depends(current_username),
    role: str = Depends(current_role),
):
    service = PlatformService(db)
    case = service.create_feedback_case(
        username,
        FeedbackCaseCreate(
            url=request.url,
            report_id=request.report_id,
            feedback_type=request.feedback_type,
            status="pending_review",
            comment=request.comment,
            source="plugin",
        ),
    )
    action = ReportActionModel(
        report_id=request.report_id or 0,
        actor=username,
        actor_role=role,
        action_type=request.feedback_type,
        status="pending_review",
        note=f"{request.url}\n{request.comment or ''}".strip(),
    )
    db.add(action)
    db.commit()
    service.record_plugin_event(
        username,
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
    return {"code": 0, "message": "feedback submitted", "data": {"case_id": case.id}}


@router.get("/feedback-cases", response_model=ApiResponse[FeedbackCaseList])
def get_feedback_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(default=None),
    username: str = Depends(current_username),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    total, cases = PlatformService(db).list_feedback_cases(
        username=username,
        role=role,
        page=page,
        page_size=page_size,
        status=status,
    )
    return {
        "code": 0,
        "message": "success",
        "data": {"total": total, "cases": [FeedbackCaseItem.model_validate(item) for item in cases]},
    }


@router.put("/feedback-cases/{case_id}", response_model=ApiResponse[FeedbackCaseItem])
def update_feedback_case(
    case_id: int,
    request: FeedbackCaseUpdate,
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    if role != "admin":
        return {"code": 403, "message": "仅管理员可处理反馈案件", "data": None}
    case = PlatformService(db).update_feedback_case(case_id, request.status, request.comment)
    if not case:
        return {"code": 404, "message": "反馈案件不存在", "data": None}
    return {"code": 0, "message": "success", "data": FeedbackCaseItem.model_validate(case)}
