from datetime import datetime, timezone
from typing import Any, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import (
    DomainBlacklist as DomainBlacklistModel,
    DomainWhitelist as DomainWhitelistModel,
    FeedbackCase as FeedbackCaseModel,
    PluginSyncEvent as PluginSyncEventModel,
    ReportAction as ReportActionModel,
    RuleConfig as RuleConfigModel,
    ScanRecord as ScanRecordModel,
    UserSiteStrategy as UserSiteStrategyModel,
)
from ..schemas import (
    ApiResponse,
    FeedbackCaseCreate,
    FeedbackCaseItem,
    FeedbackCaseList,
    PluginDefaultConfig,
    PluginEventStats,
    PluginPolicyBundle,
    PluginSyncEventCreate,
    PluginSyncEventItem,
    PluginSyncEventList,
    ScanResult,
)
from ..services import Detector

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


def current_username(x_webguard_user: str | None = Header(default=None)) -> str:
    return (x_webguard_user or "platform-user").strip() or "platform-user"


def current_role(x_webguard_role: str | None = Header(default=None)) -> str:
    return (x_webguard_role or "user").strip() or "user"


def normalize_domain(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip().lower()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.hostname or raw).replace("www.", "", 1)


def domain_from_url(url: str | None) -> str:
    if not url:
        return ""
    return normalize_domain(url)


def rule_version(db: Session) -> str:
    total = db.query(func.count(RuleConfigModel.id)).scalar() or 0
    latest = db.query(func.max(RuleConfigModel.updated_at)).scalar()
    if latest:
        return f"rules-{total}-{latest.isoformat()}"
    return f"rules-{total}-initial"


def create_plugin_event(
    db: Session,
    username: str,
    event_type: str,
    *,
    action: str | None = None,
    url: str | None = None,
    domain: str | None = None,
    risk_label: str | None = None,
    risk_score: float | None = None,
    summary: str | None = None,
    scan_record_id: int | None = None,
    plugin_version: str | None = "1.0.0",
    metadata: dict[str, Any] | None = None,
) -> PluginSyncEventModel:
    event = PluginSyncEventModel(
        username=username,
        event_type=event_type,
        action=action,
        url=url,
        domain=normalize_domain(domain or domain_from_url(url)),
        risk_label=risk_label,
        risk_score=risk_score,
        summary=summary,
        scan_record_id=scan_record_id,
        plugin_version=plugin_version or "1.0.0",
        source="plugin",
        metadata_json=metadata or {},
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def create_feedback_case(
    db: Session,
    username: str,
    request: FeedbackCaseCreate,
) -> FeedbackCaseModel:
    record = None
    if request.report_id:
        record = db.query(ScanRecordModel).filter(ScanRecordModel.id == request.report_id).first()
    url = request.url or (record.url if record else None)
    case = FeedbackCaseModel(
        username=username,
        report_id=request.report_id,
        url=url,
        domain=domain_from_url(url),
        feedback_type=request.feedback_type,
        status=request.status,
        comment=request.comment,
        source=request.source,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("/policy", response_model=ApiResponse[PluginPolicyBundle])
def get_plugin_policy(
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    active_strategies = db.query(UserSiteStrategyModel).filter(
        UserSiteStrategyModel.username == username,
        UserSiteStrategyModel.is_active.is_(True),
    ).filter(
        (UserSiteStrategyModel.expires_at.is_(None)) | (UserSiteStrategyModel.expires_at > now)
    ).all()
    data = PluginPolicyBundle(
        username=username,
        rule_version=rule_version(db),
        defaults=PluginDefaultConfig(),
        user_trusted_hosts=[
            item.domain for item in active_strategies if item.strategy_type == "trusted"
        ],
        user_blocked_hosts=[
            item.domain for item in active_strategies if item.strategy_type == "blocked"
        ],
        user_paused_hosts=[
            {
                "domain": item.domain,
                "expires_at": item.expires_at.isoformat() if item.expires_at else None,
                "reason": item.reason,
            }
            for item in active_strategies
            if item.strategy_type == "paused"
        ],
        global_trusted_hosts=[
            item.domain for item in db.query(DomainWhitelistModel).order_by(DomainWhitelistModel.domain.asc()).all()
        ],
        global_blocked_hosts=[
            item.domain for item in db.query(DomainBlacklistModel).order_by(DomainBlacklistModel.domain.asc()).all()
        ],
        generated_at=now,
    )
    return {"code": 0, "message": "success", "data": data}


@router.post("/analyze-current", response_model=ApiResponse[ScanResult])
def analyze_current(
    request: AnalyzeCurrentRequest,
    db: Session = Depends(get_db),
    username: str = Depends(current_username),
):
    detector = Detector(db)
    page_data = {
        "url": request.url,
        "title": request.title,
        "visible_text": request.visible_text,
        "button_texts": request.button_texts,
        "input_labels": request.input_labels,
        "form_action_domains": request.form_action_domains,
        "has_password_input": request.has_password_input,
    }
    result = detector.detect_page(page_data, source="plugin", username=username)
    create_plugin_event(
        db,
        username,
        "scan",
        url=request.url,
        domain=domain_from_url(request.url),
        risk_label=result.get("label"),
        risk_score=result.get("risk_score"),
        summary=result.get("explanation"),
        scan_record_id=result.get("record_id"),
        metadata={
            "title": request.title,
            "has_password_input": request.has_password_input,
            "form_action_domains": request.form_action_domains,
        },
    )
    return {"code": 0, "message": "success", "data": result}


@router.post("/events", response_model=ApiResponse[PluginSyncEventItem])
def record_plugin_event(
    request: PluginSyncEventCreate,
    db: Session = Depends(get_db),
    username: str = Depends(current_username),
):
    event = create_plugin_event(
        db,
        username,
        request.event_type,
        action=request.action,
        url=request.url,
        domain=request.domain,
        risk_label=request.risk_label,
        risk_score=request.risk_score,
        summary=request.summary,
        scan_record_id=request.scan_record_id,
        plugin_version=request.plugin_version,
        metadata=request.metadata,
    )
    return {"code": 0, "message": "success", "data": PluginSyncEventItem.model_validate(event)}


@router.get("/events", response_model=ApiResponse[PluginSyncEventList])
def get_plugin_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: str | None = Query(default=None),
    risk_label: str | None = Query(default=None),
    username: str = Depends(current_username),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    query = db.query(PluginSyncEventModel)
    if role != "admin":
        query = query.filter(PluginSyncEventModel.username == username)
    if event_type:
        query = query.filter(PluginSyncEventModel.event_type == event_type)
    if risk_label:
        query = query.filter(PluginSyncEventModel.risk_label == risk_label)
    total = query.count()
    events = query.order_by(desc(PluginSyncEventModel.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": total,
            "events": [PluginSyncEventItem.model_validate(item) for item in events],
        },
    }


@router.get("/stats", response_model=ApiResponse[PluginEventStats])
def get_plugin_stats(
    username: str = Depends(current_username),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    query = db.query(PluginSyncEventModel)
    if role != "admin":
        query = query.filter(PluginSyncEventModel.username == username)
    events = query.all()
    data = PluginEventStats(
        total_events=len(events),
        scan_events=len([item for item in events if item.event_type == "scan"]),
        warning_events=len([item for item in events if item.event_type == "warning"]),
        bypass_events=len([item for item in events if item.event_type == "bypass"]),
        trust_events=len([item for item in events if item.event_type in ("trust", "temporary_trust")]),
        feedback_events=len([item for item in events if item.event_type == "feedback"]),
        malicious_events=len([item for item in events if item.risk_label == "malicious"]),
        suspicious_events=len([item for item in events if item.risk_label == "suspicious"]),
    )
    return {"code": 0, "message": "success", "data": data}


@router.post("/feedback", response_model=ApiResponse[dict])
def submit_feedback(
    request: FeedbackRequest,
    db: Session = Depends(get_db),
    username: str = Depends(current_username),
    role: str = Depends(current_role),
):
    case = create_feedback_case(
        db,
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
    create_plugin_event(
        db,
        username,
        "feedback",
        action=request.feedback_type,
        url=request.url,
        domain=domain_from_url(request.url),
        scan_record_id=request.report_id,
        summary=request.comment,
        metadata={"feedback_case_id": case.id},
    )
    return {
        "code": 0,
        "message": "feedback submitted",
        "data": {"case_id": case.id},
    }


@router.get("/feedback-cases", response_model=ApiResponse[FeedbackCaseList])
def get_feedback_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(default=None),
    username: str = Depends(current_username),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    query = db.query(FeedbackCaseModel)
    if role != "admin":
        query = query.filter(FeedbackCaseModel.username == username)
    if status:
        query = query.filter(FeedbackCaseModel.status == status)
    total = query.count()
    cases = query.order_by(desc(FeedbackCaseModel.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": total,
            "cases": [FeedbackCaseItem.model_validate(item) for item in cases],
        },
    }
