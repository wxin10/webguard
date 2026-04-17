from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import RuleConfig
from ..schemas import FeedbackCaseItem, PluginDefaultConfig
from ..services.platform_service import PlatformService


router = APIRouter(prefix="/api/v1/admin", tags=["admin-platform"])


def current_username(x_webguard_user: str | None = Header(default=None)) -> str:
    return (x_webguard_user or "platform-user").strip() or "platform-user"


def current_role(x_webguard_role: str | None = Header(default=None)) -> str:
    return (x_webguard_role or "user").strip() or "user"


def ok(data: Any = None, message: str = "success"):
    return {"success": True, "code": 0, "message": message, "data": data}


def fail(message: str, code: int = 403):
    return {"success": False, "code": code, "message": message, "data": None}


def require_admin(role: str):
    if role != "admin":
        return fail("admin permission required", 403)
    return None


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


def _rule_payload(rule: RuleConfig):
    return {
        "id": rule.id,
        "name": rule.rule_name,
        "rule_key": rule.rule_key,
        "type": rule.type or rule.category or "heuristic",
        "scope": rule.scope or "global",
        "status": rule.status or ("active" if rule.enabled else "disabled"),
        "version": rule.version or "v1",
        "pattern": rule.pattern or rule.rule_key,
        "content": rule.content or rule.description,
        "description": rule.description,
        "category": rule.category,
        "severity": rule.severity,
        "enabled": rule.enabled,
        "weight": rule.weight,
        "threshold": rule.threshold,
        "updated_at": rule.updated_at,
    }


@router.get("/rules")
def get_admin_rules(
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    rules = db.query(RuleConfig).order_by(desc(RuleConfig.updated_at)).all()
    return ok({"total": len(rules), "rules": [_rule_payload(rule) for rule in rules]})


@router.post("/rules")
def create_admin_rule(
    request: AdminRuleRequest,
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    rule_key = request.pattern or request.name.lower().replace(" ", "_")
    rule = RuleConfig(
        rule_key=rule_key,
        rule_name=request.name,
        type=request.type,
        scope=request.scope,
        status=request.status,
        version=request.version,
        pattern=request.pattern or rule_key,
        content=request.content,
        description=request.description,
        category=request.category,
        severity=request.severity,
        enabled=request.status == "active",
        weight=request.weight,
        threshold=request.threshold,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return ok(_rule_payload(rule), "rule created")


@router.patch("/rules/{rule_id}")
def update_admin_rule(
    rule_id: int,
    request: AdminRulePatch,
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    rule = db.query(RuleConfig).filter(RuleConfig.id == rule_id).first()
    if not rule:
        return fail("rule not found", 404)
    patch = request.model_dump(exclude_unset=True)
    if "name" in patch:
        rule.rule_name = patch["name"]
    for key in ["type", "scope", "status", "version", "pattern", "content", "description", "category", "severity", "weight", "threshold"]:
        if key in patch:
            setattr(rule, key, patch[key])
    if "status" in patch:
        rule.enabled = patch["status"] == "active"
    db.commit()
    db.refresh(rule)
    return ok(_rule_payload(rule), "rule updated")


@router.delete("/rules/{rule_id}")
def delete_admin_rule(
    rule_id: int,
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    rule = db.query(RuleConfig).filter(RuleConfig.id == rule_id).first()
    if not rule:
        return fail("rule not found", 404)
    rule.status = "disabled"
    rule.enabled = False
    db.commit()
    return ok({"id": rule_id}, "rule disabled")


@router.get("/domains")
def get_admin_domains(
    list_type: str | None = Query(default=None),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    items = PlatformService(db).list_domains("global", list_type=list_type)
    return ok({"total": len(items), "items": items})


@router.post("/domains")
def create_admin_domain(
    request: AdminDomainRequest,
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    item = PlatformService(db).create_domain(owner_type="global", username=None, data=request.model_dump())
    return ok(item, "domain saved")


@router.patch("/domains/{item_id}")
def update_admin_domain(
    item_id: int,
    request: AdminDomainPatch,
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    item = PlatformService(db).update_domain(
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
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    deleted = PlatformService(db).delete_domain(item_id, owner_type="global")
    if not deleted:
        return fail("domain item not found", 404)
    return ok({"id": item_id}, "domain disabled")


@router.get("/plugin/config")
def get_plugin_config(role: str = Depends(current_role), db: Session = Depends(get_db)):
    denied = require_admin(role)
    if denied:
        return denied
    service = PlatformService(db)
    return ok(
        {
            "config": service.plugin_defaults().model_dump(),
            "rule_version": service.rule_version(),
            "stats": service.plugin_stats("platform-user", "admin"),
        }
    )


@router.patch("/plugin/config")
def update_plugin_config(
    request: PluginConfigPatch,
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    config: PluginDefaultConfig = PlatformService(db).update_plugin_defaults(request.model_dump(exclude_unset=True))
    return ok(config.model_dump(), "plugin config updated")


@router.get("/feedback")
def get_admin_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(default=None),
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    total, cases = PlatformService(db).list_feedback_cases(
        username="platform-user",
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
    role: str = Depends(current_role),
    db: Session = Depends(get_db),
):
    denied = require_admin(role)
    if denied:
        return denied
    case = PlatformService(db).update_feedback_case(case_id, request.status, request.comment)
    if not case:
        return fail("feedback case not found", 404)
    return ok(FeedbackCaseItem.model_validate(case), "feedback updated")
