from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..core import get_db
from ..models import RuleConfig as RuleConfigModel
from ..schemas import ApiResponse, RuleConfig, RuleConfigList, RuleConfigUpdate, RuleStatsList
from ..services.rule_engine import build_rule_stats, db_order_rules, ensure_default_rules


router = APIRouter(prefix="/api/v1/rules", tags=["rules"])


@router.get("/stats", response_model=ApiResponse[RuleStatsList])
def get_rule_stats(db: Session = Depends(get_db)):
    stats = build_rule_stats(db)
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": len(stats),
            "stats": stats,
        },
    }


@router.get("", response_model=ApiResponse[RuleConfigList])
def get_rules(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(100, ge=1, le=200, description="每页数量"),
    db: Session = Depends(get_db),
):
    ensure_default_rules(db)
    stats_by_key = {item["rule_key"]: item for item in build_rule_stats(db)}
    all_rules = db_order_rules(db.query(RuleConfigModel).all())
    offset = (page - 1) * page_size
    rules = all_rules[offset : offset + page_size]
    rule_list = []
    for rule in rules:
        payload = RuleConfig.model_validate(rule).model_dump()
        payload["stats"] = stats_by_key.get(rule.rule_key)
        rule_list.append(payload)
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": len(all_rules),
            "rules": rule_list,
        },
    }


@router.put("/{rule_id}", response_model=ApiResponse[RuleConfig])
def update_rule(rule_id: int, request: RuleConfigUpdate, db: Session = Depends(get_db)):
    ensure_default_rules(db)
    rule = db.query(RuleConfigModel).filter(RuleConfigModel.id == rule_id).first()
    if not rule:
        return {
            "code": 404,
            "message": "规则不存在",
            "data": None,
        }

    patch = request.model_dump(exclude_unset=True)
    if "weight" in patch:
        rule.weight = patch["weight"]
    if "threshold" in patch:
        rule.threshold = patch["threshold"]
    if "enabled" in patch:
        rule.enabled = patch["enabled"]
    if patch.get("name") is not None or patch.get("rule_name") is not None:
        rule.rule_name = patch.get("name") or patch.get("rule_name")
    if "description" in patch:
        rule.description = patch["description"]
    if patch.get("severity") is not None:
        rule.severity = patch["severity"]
    if patch.get("category") is not None:
        rule.category = patch["category"]

    db.commit()
    db.refresh(rule)
    return {
        "code": 0,
        "message": "success",
        "data": RuleConfig.model_validate(rule),
    }
