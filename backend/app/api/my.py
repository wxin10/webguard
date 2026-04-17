from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import Principal, fail, ok, principal_from_headers
from ..schemas import FeedbackCaseCreate, FeedbackCaseItem, PluginSyncEventCreate, PluginSyncEventItem
from ..services.domain_service import DomainService
from ..services.feedback_service import FeedbackService
from ..services.plugin_event_service import PluginEventService
from ..services.policy_service import PolicyService
from ..services.report_service import ReportService


router = APIRouter(prefix="/api/v1/my", tags=["my-platform"])


class MyDomainRequest(BaseModel):
    host: str = Field(..., min_length=1)
    list_type: str = Field(..., pattern="^(trusted|blocked|temp_bypass)$")
    source: str = "manual"
    reason: str | None = None
    expires_at: str | None = None
    minutes: int | None = None


class MyDomainPatch(BaseModel):
    host: str | None = None
    list_type: str | None = Field(default=None, pattern="^(trusted|blocked|temp_bypass)$")
    source: str | None = None
    status: str | None = None
    reason: str | None = None
    expires_at: str | None = None


class UserPolicyPatch(BaseModel):
    auto_detect: bool | None = None
    auto_block_malicious: bool | None = None
    notify_suspicious: bool | None = None
    bypass_duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    plugin_enabled: bool | None = None


class FeedbackRequest(BaseModel):
    url: str | None = None
    report_id: int | None = None
    related_report_id: int | None = None
    related_event_id: int | None = None
    feedback_type: str = Field("false_positive", pattern="^(false_positive|false_negative|other)$")
    content: str | None = None
    comment: str | None = None
    source: str = "web"


@router.get("/domains")
def get_my_domains(
    list_type: str | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    items = DomainService(db).list_domains("user", username=principal.username, list_type=list_type)
    return ok({"total": len(items), "items": items})


@router.post("/domains")
def create_my_domain(
    request: MyDomainRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    item = DomainService(db).create_domain(owner_type="user", username=principal.username, data=request.model_dump())
    return ok(item, "domain saved")


@router.patch("/domains/{item_id}")
def update_my_domain(
    item_id: int,
    request: MyDomainPatch,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    item = DomainService(db).update_domain(
        item_id,
        owner_type="user",
        username=principal.username,
        data=request.model_dump(exclude_unset=True),
    )
    if not item:
        return fail("domain item not found", 404)
    return ok(item, "domain updated")


@router.delete("/domains/{item_id}")
def delete_my_domain(
    item_id: int,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    deleted = DomainService(db).delete_domain(item_id, owner_type="user", username=principal.username)
    if not deleted:
        return fail("domain item not found", 404)
    return ok({"id": item_id}, "domain disabled")


@router.get("/policy")
def get_my_policy(principal: Principal = Depends(principal_from_headers), db: Session = Depends(get_db)):
    policy = PolicyService(db).get_or_create_policy(principal.username)
    return ok(policy)


@router.patch("/policy")
def update_my_policy(
    request: UserPolicyPatch,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    policy = PolicyService(db).update_policy(principal.username, request.model_dump(exclude_unset=True))
    return ok(policy, "policy updated")


@router.get("/plugin-events")
def get_my_plugin_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    total, events = PluginEventService(db).list_events(
        username=principal.username,
        role=principal.role,
        page=page,
        page_size=page_size,
        event_type=event_type,
        risk_label=risk_level,
    )
    return ok({"total": total, "events": [PluginSyncEventItem.model_validate(item) for item in events]})


@router.post("/plugin-events")
def record_my_plugin_event(
    request: PluginSyncEventCreate,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    event = PluginEventService(db).record_event(principal.username, request)
    return ok(PluginSyncEventItem.model_validate(event), "event recorded")


@router.get("/feedback")
def get_my_feedback(
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


@router.post("/feedback")
def create_my_feedback(
    request: FeedbackRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    case = FeedbackService(db).create_case(
        principal.username,
        FeedbackCaseCreate(
            url=request.url,
            report_id=request.related_report_id or request.report_id,
            related_report_id=request.related_report_id,
            related_event_id=request.related_event_id,
            feedback_type=request.feedback_type,
            status="pending_review",
            content=request.content,
            comment=request.comment or request.content,
            source=request.source,
        ),
        report_service=ReportService(db),
    )
    return ok(FeedbackCaseItem.model_validate(case), "feedback submitted")
