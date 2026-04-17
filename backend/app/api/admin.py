from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import Principal, fail, ok, principal_from_headers, require_admin
from ..schemas import FeedbackCaseItem
from ..services.admin_rule_service import AdminRuleService
from ..services.domain_service import DomainService
from ..services.feedback_service import FeedbackService
from ..services.plugin_event_service import PluginEventService
from ..services.policy_service import PolicyService


router = APIRouter(prefix="/api/v1/admin", tags=["admin-platform"])


class AdminRuleRequest(BaseModel):
    name: str = Field(..., min_length=1)
    type: str = "heuristic"
    scope: str = Field("global", pattern="^(global|user|plugin)$")
    status: str = Field("active", pattern="^(active|disabled)$")
    version: str = "v1"
    pattern: str | None = None
    content: str | None = None
    description: str | None = None
    category: str = "general"
    severity: str = "medium"
    weight: float = Field(10, ge=0, le=100)
    threshold: float = Field(1, ge=0)


class AdminRulePatch(BaseModel):
    name: str | None = None
    type: str | None = None
    scope: str | None = Field(default=None, pattern="^(global|user|plugin)$")
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
    version: str | None = None
    pattern: str | None = None
    content: str | None = None
    description: str | None = None
    category: str | None = None
    severity: str | None = None
    weight: float | None = Field(default=None, ge=0, le=100)
    threshold: float | None = Field(default=None, ge=0)


class AdminDomainRequest(BaseModel):
    host: str = Field(..., min_length=1)
    list_type: str = Field(..., pattern="^(trusted|blocked)$")
    source: str = "manual"
    reason: str | None = None
    status: str = "active"


class AdminDomainPatch(BaseModel):
    host: str | None = None
    list_type: str | None = Field(default=None, pattern="^(trusted|blocked)$")
    source: str | None = None
    reason: str | None = None
    status: str | None = None


class PluginConfigPatch(BaseModel):
    api_base_url: str | None = None
    web_base_url: str | None = None
    auto_detect: bool | None = None
    auto_block_malicious: bool | None = None
    notify_suspicious: bool | None = None
    event_upload_enabled: bool | None = None


class FeedbackPatch(BaseModel):
    status: str
    comment: str | None = None


@router.get("/rules")
def get_admin_rules(principal: Principal = Depends(principal_from_headers), db: Session = Depends(get_db)):
    denied = require_admin(principal)
    if denied:
        return denied
    return ok(AdminRuleService(db).list_rules())


@router.post("/rules")
def create_admin_rule(
    request: AdminRuleRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    return ok(AdminRuleService(db).create_rule(request.model_dump()), "rule created")


@router.patch("/rules/{rule_id}")
def update_admin_rule(
    rule_id: int,
    request: AdminRulePatch,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    rule = AdminRuleService(db).update_rule(rule_id, request.model_dump(exclude_unset=True))
    if not rule:
        return fail("rule not found", 404)
    return ok(rule, "rule updated")


@router.delete("/rules/{rule_id}")
def delete_admin_rule(
    rule_id: int,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    if not AdminRuleService(db).delete_rule(rule_id):
        return fail("rule not found", 404)
    return ok({"id": rule_id}, "rule disabled")


@router.get("/domains")
def get_admin_domains(
    list_type: str | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    items = DomainService(db).list_domains("global", list_type=list_type)
    return ok({"total": len(items), "items": items})


@router.post("/domains")
def create_admin_domain(
    request: AdminDomainRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    item = DomainService(db).create_domain(owner_type="global", username=None, data=request.model_dump())
    return ok(item, "domain saved")


@router.patch("/domains/{item_id}")
def update_admin_domain(
    item_id: int,
    request: AdminDomainPatch,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    item = DomainService(db).update_domain(
        item_id,
        owner_type="global",
        username=None,
        data=request.model_dump(exclude_unset=True),
    )
    if not item:
        return fail("domain item not found", 404)
    return ok(item, "domain updated")


@router.delete("/domains/{item_id}")
def delete_admin_domain(
    item_id: int,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    if not DomainService(db).delete_domain(item_id, owner_type="global"):
        return fail("domain item not found", 404)
    return ok({"id": item_id}, "domain disabled")


@router.get("/plugin/config")
def get_plugin_config(principal: Principal = Depends(principal_from_headers), db: Session = Depends(get_db)):
    denied = require_admin(principal)
    if denied:
        return denied
    policy_service = PolicyService(db)
    return ok(
        {
            "config": policy_service.plugin_defaults().model_dump(),
            "rule_version": policy_service.rule_version(),
            "stats": PluginEventService(db).stats(principal.username, "admin"),
        }
    )


@router.patch("/plugin/config")
def update_plugin_config(
    request: PluginConfigPatch,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    config = PolicyService(db).update_plugin_defaults(request.model_dump(exclude_unset=True))
    return ok(config.model_dump(), "plugin config updated")


@router.get("/feedback")
def get_admin_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(default=None),
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    total, cases = FeedbackService(db).list_cases(
        username=principal.username,
        role="admin",
        page=page,
        page_size=page_size,
        status=status,
    )
    return ok({"total": total, "cases": [FeedbackCaseItem.model_validate(item) for item in cases]})


@router.patch("/feedback/{case_id}")
def update_admin_feedback(
    case_id: int,
    request: FeedbackPatch,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    denied = require_admin(principal)
    if denied:
        return denied
    case = FeedbackService(db).update_case(case_id, request.status, request.comment)
    if not case:
        return fail("feedback case not found", 404)
    return ok(FeedbackCaseItem.model_validate(case), "feedback updated")
