from __future__ import annotations

from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models import RuleConfig


class AdminRuleService:
    def __init__(self, db: Session):
        self.db = db

    def list_rules(self) -> dict[str, Any]:
        rules = self.db.query(RuleConfig).order_by(desc(RuleConfig.updated_at)).all()
        return {"total": len(rules), "rules": [self.rule_payload(rule) for rule in rules]}

    def create_rule(self, data: dict[str, Any]) -> dict[str, Any]:
        name = data["name"]
        rule_key = data.get("pattern") or name.lower().replace(" ", "_")
        rule = RuleConfig(
            rule_key=rule_key,
            rule_name=name,
            type=data.get("type") or "heuristic",
            scope=data.get("scope") or "global",
            status=data.get("status") or "active",
            version=data.get("version") or "v1",
            pattern=data.get("pattern") or rule_key,
            content=data.get("content"),
            description=data.get("description"),
            category=data.get("category") or "general",
            severity=data.get("severity") or "medium",
            enabled=(data.get("status") or "active") == "active",
            weight=data.get("weight", 10),
            threshold=data.get("threshold", 1),
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return self.rule_payload(rule)

    def update_rule(self, rule_id: int, patch: dict[str, Any]) -> dict[str, Any] | None:
        rule = self.db.query(RuleConfig).filter(RuleConfig.id == rule_id).first()
        if not rule:
            return None
        if "name" in patch and patch["name"] is not None:
            rule.rule_name = patch["name"]
        for key in [
            "type",
            "scope",
            "status",
            "version",
            "pattern",
            "content",
            "description",
            "category",
            "severity",
            "weight",
            "threshold",
        ]:
            if key in patch and patch[key] is not None:
                setattr(rule, key, patch[key])
        if "status" in patch and patch["status"] is not None:
            rule.enabled = patch["status"] == "active"
        self.db.commit()
        self.db.refresh(rule)
        return self.rule_payload(rule)

    def delete_rule(self, rule_id: int) -> bool:
        rule = self.db.query(RuleConfig).filter(RuleConfig.id == rule_id).first()
        if not rule:
            return False
        rule.status = "disabled"
        rule.enabled = False
        self.db.commit()
        return True

    def rule_payload(self, rule: RuleConfig) -> dict[str, Any]:
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
