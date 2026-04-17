from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db
from ..schemas import FeedbackCaseCreate, FeedbackCaseItem, PluginSyncEventCreate, PluginSyncEventItem
from ..services.platform_service import PlatformService


router = APIRouter(prefix="/api/v1/my", tags=["my-platform"])


def current_username(x_webguard_user: str | None = Header(default=None)) -> str:
    return (x_webguard_user or "platform-user").strip() or "platform-user"


def ok(data: Any = None, message: str = "success"):
    return {"success": True, "code": 0, "message": message, "data": data}


def fail(message: str, code: int = 404):
    return {"success": False, "code": code, "message": message, "data": None}


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
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    items = PlatformService(db).list_domains("user", username=username, list_type=list_type)
    return ok({"total": len(items), "items": items})


@router.post("/domains")
def create_my_domain(
    request: MyDomainRequest,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    item = PlatformService(db).create_domain(owner_type="user", username=username, data=request.model_dump())
    return ok(item, "domain saved")


@router.patch("/domains/{item_id}")
def update_my_domain(
    item_id: int,
    request: MyDomainPatch,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    item = PlatformService(db).update_domain(
        item_id,
        owner_type="user",
        username=username,
        data=request.model_dump(exclude_unset=True),
    )
    if not item:
        return fail("domain item not found")
    return ok(item, "domain updated")


@router.delete("/domains/{item_id}")
def delete_my_domain(
    item_id: int,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    deleted = PlatformService(db).delete_domain(item_id, owner_type="user", username=username)
    if not deleted:
        return fail("domain item not found")
    return ok({"id": item_id}, "domain disabled")


@router.get("/policy")
def get_my_policy(username: str = Depends(current_username), db: Session = Depends(get_db)):
    policy = PlatformService(db).get_or_create_policy(username)
    return ok(policy)


@router.patch("/policy")
def update_my_policy(
    request: UserPolicyPatch,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    policy = PlatformService(db).update_policy(username, request.model_dump(exclude_unset=True))
    return ok(policy, "policy updated")


@router.get("/plugin-events")
def get_my_plugin_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    total, events = PlatformService(db).list_plugin_events(
        username=username,
        role="user",
        page=page,
        page_size=page_size,
        event_type=event_type,
        risk_label=risk_level,
    )
    return ok({"total": total, "events": [PluginSyncEventItem.model_validate(item) for item in events]})


@router.post("/plugin-events")
def record_my_plugin_event(
    request: PluginSyncEventCreate,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    event = PlatformService(db).record_plugin_event(username, request)
    return ok(PluginSyncEventItem.model_validate(event), "event recorded")


@router.get("/feedback")
def get_my_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(default=None),
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    total, cases = PlatformService(db).list_feedback_cases(
        username=username,
        role="user",
        page=page,
        page_size=page_size,
        status=status,
    )
    return ok({"total": total, "cases": [FeedbackCaseItem.model_validate(item) for item in cases]})


@router.post("/feedback")
def create_my_feedback(
    request: FeedbackRequest,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    case = PlatformService(db).create_feedback_case(
        username,
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
    )
    return ok(FeedbackCaseItem.model_validate(case), "feedback submitted")
