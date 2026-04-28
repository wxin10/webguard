from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..core.exceptions import WebGuardException
from ..models import RuleConfig
from .rule_engine import DEFAULT_BRAND_DOMAIN_MAP, DEFAULT_RULES, RuleEngine, ensure_default_rules


VALID_SEVERITIES = {"low", "medium", "high", "critical"}
DEFAULT_RULE_KEYS = {item["rule_key"] for item in DEFAULT_RULES}


class AdminRuleService:
    def __init__(self, db: Session):
        self.db = db

    def list_rules(self) -> dict[str, Any]:
        ensure_default_rules(self.db)
        rules = self.db.query(RuleConfig).order_by(desc(RuleConfig.updated_at)).all()
        return {"total": len(rules), "rules": [self.rule_payload(rule) for rule in rules]}

    def create_rule(self, data: dict[str, Any]) -> dict[str, Any]:
        name = self._clean_required(data.get("name"), "name")
        rule_key = self._clean_rule_key(data.get("rule_key") or data.get("pattern") or name)
        if self.db.query(RuleConfig).filter(RuleConfig.rule_key == rule_key).first():
            raise WebGuardException(status_code=409, detail="rule_key already exists", code=40901)
        status, enabled = self._normalize_status_enabled(data)
        rule = RuleConfig(
            rule_key=rule_key,
            rule_name=name,
            type=data.get("type") or "heuristic",
            scope=data.get("scope") or "global",
            status=status,
            version=data.get("version") or "v1",
            pattern=data.get("pattern"),
            content=data.get("content"),
            description=data.get("description"),
            category=data.get("category") or "general",
            severity=self._validate_severity(data.get("severity") or "medium"),
            enabled=enabled,
            weight=self._validate_weight(data.get("weight", 10)),
            threshold=self._validate_threshold(data.get("threshold", 1)),
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
            rule.rule_name = self._clean_required(patch["name"], "name")
        if "rule_key" in patch and patch["rule_key"] is not None:
            new_key = self._clean_rule_key(patch["rule_key"])
            existing = self.db.query(RuleConfig).filter(RuleConfig.rule_key == new_key, RuleConfig.id != rule_id).first()
            if existing:
                raise WebGuardException(status_code=409, detail="rule_key already exists", code=40901)
            rule.rule_key = new_key
        if "status" in patch or "enabled" in patch:
            status, enabled = self._normalize_status_enabled(patch, current_status=rule.status, current_enabled=rule.enabled)
            rule.status = status
            rule.enabled = enabled
        for key in [
            "type",
            "scope",
            "version",
            "pattern",
            "content",
            "description",
            "category",
        ]:
            if key in patch and patch[key] is not None:
                setattr(rule, key, patch[key])
        if "severity" in patch and patch["severity"] is not None:
            rule.severity = self._validate_severity(patch["severity"])
        if "weight" in patch and patch["weight"] is not None:
            rule.weight = self._validate_weight(patch["weight"])
        if "threshold" in patch and patch["threshold"] is not None:
            rule.threshold = self._validate_threshold(patch["threshold"])
        if not str(rule.rule_key or "").strip():
            raise WebGuardException(status_code=422, detail="rule_key is required", code=42201)
        self.db.commit()
        self.db.refresh(rule)
        return self.rule_payload(rule)

    def delete_rule(self, rule_id: int) -> dict[str, Any] | None:
        rule = self.db.query(RuleConfig).filter(RuleConfig.id == rule_id).first()
        if not rule:
            return None
        rule.status = "disabled"
        rule.enabled = False
        self.db.commit()
        self.db.refresh(rule)
        return self.rule_payload(rule)

    def test_rule(self, data: dict[str, Any]) -> dict[str, Any]:
        rule_data = data.get("rule") or {}
        sample = data.get("sample") or {}
        rule_key = self._clean_rule_key(rule_data.get("rule_key") or rule_data.get("pattern") or rule_data.get("name") or "draft_rule")
        status, enabled = self._normalize_status_enabled(rule_data)
        transient_rule = RuleConfig(
            id=rule_data.get("id"),
            rule_key=rule_key,
            rule_name=rule_data.get("name") or rule_data.get("rule_name") or rule_key,
            type=rule_data.get("type") or "heuristic",
            scope=rule_data.get("scope") or "global",
            status=status,
            version=rule_data.get("version") or "v1",
            pattern=rule_data.get("pattern"),
            content=rule_data.get("content"),
            description=rule_data.get("description"),
            category=rule_data.get("category") or "general",
            severity=self._validate_severity(rule_data.get("severity") or "medium"),
            enabled=enabled,
            weight=self._validate_weight(rule_data.get("weight", 10)),
            threshold=self._validate_threshold(rule_data.get("threshold", 1)),
        )

        invalid_dsl = self._content_dsl_error(transient_rule)
        if invalid_dsl:
            result = {
                "id": transient_rule.id,
                "rule_key": transient_rule.rule_key,
                "rule_name": transient_rule.rule_name,
                "name": transient_rule.rule_name,
                "description": transient_rule.description,
                "category": transient_rule.category or "general",
                "severity": transient_rule.severity or "medium",
                "enabled": bool(transient_rule.enabled),
                "matched": False,
                "applied": False,
                "weight": float(transient_rule.weight or 0),
                "threshold": float(transient_rule.threshold or 0),
                "raw_score": 0.0,
                "weighted_score": 0.0,
                "contribution": 0.0,
                "reason": invalid_dsl,
                "detail": invalid_dsl,
                "raw_feature": {"content": transient_rule.content},
                "observed_value": 0.0,
            }
        else:
            result = self._rule_engine_for_test().evaluate_rule(transient_rule, self._sample_features(sample))

        return {
            "matched": bool(result.get("matched")),
            "applied": bool(result.get("applied")),
            "enabled": bool(result.get("enabled")),
            "contribution": float(result.get("contribution") or 0),
            "reason": result.get("reason") or "",
            "raw_feature": result.get("raw_feature") or {},
            "observed_value": float(result.get("observed_value") or 0),
            "rule_result": result,
        }

    def rule_payload(self, rule: RuleConfig) -> dict[str, Any]:
        return {
            "id": rule.id,
            "rule_name": rule.rule_name,
            "name": rule.rule_name,
            "rule_key": rule.rule_key,
            "type": rule.type or rule.category or "heuristic",
            "scope": rule.scope or "global",
            "status": rule.status or ("active" if rule.enabled else "disabled"),
            "version": rule.version or "v1",
            "pattern": rule.pattern,
            "content": rule.content,
            "description": rule.description,
            "category": rule.category,
            "severity": rule.severity,
            "enabled": bool(rule.enabled),
            "weight": float(rule.weight or 0),
            "threshold": float(rule.threshold or 0),
            "created_at": rule.created_at,
            "updated_at": rule.updated_at,
        }

    def _sample_features(self, sample: dict[str, Any]) -> dict[str, Any]:
        url = str(sample.get("url") or "")
        domain = str(sample.get("domain") or "") or (urlparse(url).hostname or "")
        raw_features = {
            "url": url,
            "domain": domain,
            "title": str(sample.get("title") or ""),
            "visible_text": str(sample.get("visible_text") or ""),
            "button_texts": self._list_strings(sample.get("button_texts")),
            "input_labels": self._list_strings(sample.get("input_labels")),
            "form_action_domains": self._list_strings(sample.get("form_action_domains")),
            "has_password_input": bool(sample.get("has_password_input", False)),
        }
        return {
            "domain": domain,
            "has_password_input": raw_features["has_password_input"],
            "raw_features": raw_features,
        }

    def _rule_engine_for_test(self) -> RuleEngine:
        engine = RuleEngine.__new__(RuleEngine)
        engine.db = self.db
        engine.rules = []
        engine.brand_keywords = RuleEngine.load_brand_keywords(engine)
        engine.risk_keywords = RuleEngine.load_risk_keywords(engine)
        engine.brand_domain_map = DEFAULT_BRAND_DOMAIN_MAP
        return engine

    def _content_dsl_error(self, rule: RuleConfig) -> str | None:
        if rule.rule_key in DEFAULT_RULE_KEYS:
            return None
        content = str(rule.content or "").strip()
        if not content:
            return None
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            return f"Invalid rule DSL: content must be valid JSON ({exc.msg})"
        if not isinstance(parsed, dict):
            return "Invalid rule DSL: content must be a JSON object"
        condition = parsed.get("condition") if isinstance(parsed.get("condition"), dict) else parsed
        if not any(key in condition for key in ("field", "all", "any", "not")):
            return "Invalid rule DSL: content must contain field/operator, all, any, or not"
        return None

    def _normalize_status_enabled(
        self,
        data: dict[str, Any],
        *,
        current_status: str | None = None,
        current_enabled: bool | None = None,
    ) -> tuple[str, bool]:
        status = data.get("status")
        enabled = data.get("enabled")
        if status is not None:
            status = str(status).strip()
            if status not in {"active", "disabled"}:
                raise WebGuardException(status_code=422, detail="status must be active or disabled", code=42201)
            return status, status == "active"
        if enabled is not None:
            enabled_bool = bool(enabled)
            return ("active" if enabled_bool else "disabled"), enabled_bool
        fallback_enabled = bool(current_enabled) if current_enabled is not None else True
        fallback_status = current_status or ("active" if fallback_enabled else "disabled")
        if fallback_status not in {"active", "disabled"}:
            fallback_status = "active" if fallback_enabled else "disabled"
        return fallback_status, fallback_status == "active"

    def _validate_severity(self, severity: str) -> str:
        clean = str(severity or "medium").strip()
        if clean not in VALID_SEVERITIES:
            raise WebGuardException(status_code=422, detail="severity must be low, medium, high, or critical", code=42201)
        return clean

    def _validate_weight(self, weight: Any) -> float:
        try:
            value = float(weight)
        except (TypeError, ValueError):
            raise WebGuardException(status_code=422, detail="weight must be a number", code=42201) from None
        if value < 0 or value > 100:
            raise WebGuardException(status_code=422, detail="weight must be between 0 and 100", code=42201)
        return value

    def _validate_threshold(self, threshold: Any) -> float:
        try:
            value = float(threshold)
        except (TypeError, ValueError):
            raise WebGuardException(status_code=422, detail="threshold must be a number", code=42201) from None
        if value < 0:
            raise WebGuardException(status_code=422, detail="threshold must be greater than or equal to 0", code=42201)
        return value

    def _clean_required(self, value: Any, field: str) -> str:
        clean = str(value or "").strip()
        if not clean:
            raise WebGuardException(status_code=422, detail=f"{field} is required", code=42201)
        return clean

    def _clean_rule_key(self, value: Any) -> str:
        clean = str(value or "").strip()
        clean = re.sub(r"[^a-zA-Z0-9_]+", "_", clean.lower()).strip("_")
        if not clean:
            raise WebGuardException(status_code=422, detail="rule_key is required", code=42201)
        return clean[:50]

    def _list_strings(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]
