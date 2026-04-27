from typing import List, Optional

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..core import get_db, settings
from ..core.auth_context import Principal, fail, ok, principal_from_headers, require_auth
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
from ..schemas.scan import normalize_scan_url, normalize_text_list
from ..services.domain_service import normalize_domain
from ..services.feedback_service import FeedbackService
from ..services.plugin_binding_service import PluginBindingService
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

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_scan_url(value)

    @field_validator("button_texts", "input_labels", "form_action_domains")
    @classmethod
    def validate_text_lists(cls, value: List[str]) -> List[str]:
        return normalize_text_list(value)


class FeedbackRequest(BaseModel):
    url: str
    feedback_type: str = "false_positive"
    comment: Optional[str] = None
    report_id: Optional[int] = None


class FeedbackCaseUpdate(BaseModel):
    status: str
    comment: Optional[str] = None


class BindingChallengeCreate(BaseModel):
    web_base_url: str | None = None


class BindingChallengeConfirm(BaseModel):
    binding_code: str = Field(..., min_length=1, max_length=20)
    display_name: str | None = Field(default=None, max_length=100)


class PluginTokenExchange(BaseModel):
    challenge_id: str = Field(..., min_length=1)
    binding_code: str = Field(..., min_length=1, max_length=20)


class PluginTokenRefresh(BaseModel):
    refresh_token: str = Field(..., min_length=1)


def _instance_payload(instance) -> dict:
    return {
        "plugin_instance_id": instance.plugin_instance_id,
        "display_name": instance.display_name,
        "plugin_version": instance.plugin_version,
        "status": instance.status,
        "bound_at": instance.bound_at.isoformat() if instance.bound_at else None,
        "revoked_at": instance.revoked_at.isoformat() if instance.revoked_at else None,
        "last_seen_at": instance.last_seen_at.isoformat() if instance.last_seen_at else None,
        "created_at": instance.created_at.isoformat() if instance.created_at else None,
        "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
    }


def _challenge_payload(challenge) -> dict:
    return {
        "challenge_id": challenge.challenge_id,
        "plugin_instance_id": challenge.plugin_instance_id,
        "status": challenge.status,
        "expires_at": challenge.expires_at.isoformat() if challenge.expires_at else None,
        "confirmed_at": challenge.confirmed_at.isoformat() if challenge.confirmed_at else None,
        "consumed_at": challenge.consumed_at.isoformat() if challenge.consumed_at else None,
    }


@router.post("/binding-challenges")
def create_binding_challenge(
    request: BindingChallengeCreate,
    x_plugin_instance_id: str | None = Header(default=None),
    x_plugin_version: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    challenge, binding_code, verification_url = PluginBindingService(db).create_challenge(
        plugin_instance_id=x_plugin_instance_id or "",
        plugin_version=x_plugin_version,
        verification_base_url=request.web_base_url,
    )
    db.commit()
    return ok(
        {
            "challenge_id": challenge.challenge_id,
            "binding_code": binding_code,
            "verification_url": verification_url,
            "expires_at": challenge.expires_at.isoformat(),
        }
    )


@router.get("/binding-challenges/{challenge_id}")
def get_binding_challenge(
    challenge_id: str,
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    challenge = PluginBindingService(db).get_challenge(challenge_id)
    return ok(_challenge_payload(challenge))


@router.post("/binding-challenges/{challenge_id}/confirm")
def confirm_binding_challenge(
    challenge_id: str,
    request: BindingChallengeConfirm,
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    challenge = PluginBindingService(db).confirm_challenge(
        challenge_id=challenge_id,
        binding_code=request.binding_code,
        username=principal.username,
        display_name=request.display_name,
    )
    db.commit()
    return ok(
        {
            "plugin_instance_id": challenge.plugin_instance_id,
            "status": challenge.status,
            "challenge_id": challenge.challenge_id,
        }
    )


@router.post("/token")
def exchange_plugin_token(
    request: PluginTokenExchange,
    x_plugin_instance_id: str | None = Header(default=None),
    x_plugin_version: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    instance, access_token, refresh_token = PluginBindingService(db).exchange_token(
        challenge_id=request.challenge_id,
        binding_code=request.binding_code,
        plugin_instance_id=x_plugin_instance_id or "",
        plugin_version=x_plugin_version,
    )
    db.commit()
    return ok(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expires_seconds,
            "plugin_instance_id": instance.plugin_instance_id,
        }
    )


@router.post("/token/refresh")
def refresh_plugin_token(
    request: PluginTokenRefresh,
    x_plugin_instance_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    instance, access_token, refresh_token = PluginBindingService(db).refresh_plugin_token(
        raw_refresh_token=request.refresh_token,
        plugin_instance_id=x_plugin_instance_id or "",
    )
    db.commit()
    return ok(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expires_seconds,
            "plugin_instance_id": instance.plugin_instance_id,
        }
    )


@router.get("/instances")
def list_plugin_instances(principal: Principal = Depends(require_auth), db: Session = Depends(get_db)):
    instances = PluginBindingService(db).list_instances_for_user(principal.username)
    return ok({"total": len(instances), "items": [_instance_payload(instance) for instance in instances]})


@router.delete("/instances/{plugin_instance_id}")
def revoke_plugin_instance(
    plugin_instance_id: str,
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    instance = PluginBindingService(db).revoke_instance(username=principal.username, plugin_instance_id=plugin_instance_id)
    db.commit()
    return ok(_instance_payload(instance))


@router.post("/unbind")
def unbind_plugin_instance(
    principal: Principal = Depends(require_auth),
    x_plugin_instance_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    instance_id = principal.plugin_instance_id or x_plugin_instance_id or ""
    instance = PluginBindingService(db).unbind_instance(plugin_instance_id=instance_id, username=principal.username)
    db.commit()
    return ok(_instance_payload(instance))


@router.get("/policy", response_model=ApiResponse[PluginPolicyBundle])
def get_plugin_policy(principal: Principal = Depends(principal_from_headers), db: Session = Depends(get_db)):
    return ok(PolicyService(db).plugin_policy(principal.username))


@router.get("/bootstrap")
def get_plugin_bootstrap(principal: Principal = Depends(require_auth), db: Session = Depends(get_db)):
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
            summary=result.get("summary") or result.get("explanation"),
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
