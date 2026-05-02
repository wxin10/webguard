from __future__ import annotations

from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models import PluginSyncEvent, Report, ReportAction, RuleConfig, ScanRecord
from ..schemas import ScanRecord as ScanRecordSchema
from .rule_engine import ensure_default_rules


class ReportService:
    def __init__(self, db: Session):
        self.db = db

    def ensure_report_for_record(self, record: ScanRecord) -> Report:
        report = self.db.query(Report).filter(Report.scan_record_id == record.id).first()
        if report:
            if not record.report_id:
                record.report_id = report.id
                self.db.commit()
            return report
        report = Report(
            scan_record_id=record.id,
            user_id=record.user_id,
            url=record.url,
            host=record.domain,
            risk_level=record.label,
            risk_score=record.risk_score,
            summary=record.explanation,
            reasons=record.hit_rules_json or [],
            matched_rules=[rule for rule in (record.hit_rules_json or []) if rule.get("matched")],
            page_signals=record.raw_features_json or {},
            recommendation=record.recommendation,
        )
        self.db.add(report)
        self.db.flush()
        record.report_id = report.id
        self.db.commit()
        self.db.refresh(report)
        return report

    def record_for_report_id(self, report_id: int) -> ScanRecord | None:
        report = self.db.query(Report).filter(Report.id == report_id).first()
        if report:
            return self.db.query(ScanRecord).filter(ScanRecord.id == report.scan_record_id).first()
        record = self.db.query(ScanRecord).filter(ScanRecord.id == report_id).first()
        if record:
            self.ensure_report_for_record(record)
        return record

    def latest_report(self, username: str | None = None, role: str = "user") -> dict[str, Any] | None:
        query = self.db.query(ScanRecord)
        # Until formal auth is introduced, legacy records may have user_id NULL;
        # keep them visible so existing local data remains usable.
        record = query.order_by(desc(ScanRecord.created_at)).first()
        if not record:
            return None
        return self.build_report(record)

    def report_by_id(self, report_id: int) -> dict[str, Any] | None:
        record = self.record_for_report_id(report_id)
        return self.build_report(record) if record else None

    def domain_history(self, report_id: int, limit: int = 20) -> dict[str, Any] | None:
        record = self.record_for_report_id(report_id)
        if not record:
            return None
        records = self.db.query(ScanRecord).filter(
            ScanRecord.domain == record.domain,
            ScanRecord.id != record.id,
        ).order_by(desc(ScanRecord.created_at)).limit(limit).all()
        return {
            "total": len(records),
            "records": [ScanRecordSchema.model_validate(item) for item in records],
        }

    def recent_actions(self, limit: int = 50) -> list[ReportAction]:
        return self.db.query(ReportAction).order_by(desc(ReportAction.created_at)).limit(limit).all()

    def report_actions(self, report_id: int) -> list[ReportAction]:
        record = self.record_for_report_id(report_id)
        ids = [report_id]
        if record:
            materialized = self.ensure_report_for_record(record)
            ids.extend([record.id, materialized.id])
        return self.db.query(ReportAction).filter(ReportAction.report_id.in_(set(ids))).order_by(desc(ReportAction.created_at)).all()

    def save_action(
        self,
        *,
        report_id: int,
        actor: str,
        actor_role: str,
        action_type: str,
        status: str = "submitted",
        note: str | None = None,
    ) -> ReportAction:
        action = ReportAction(
            report_id=report_id,
            actor=actor,
            actor_role=actor_role,
            action_type=action_type,
            status=status,
            note=note,
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        return action

    def build_report(self, record: ScanRecord) -> dict[str, Any]:
        materialized_report = self.ensure_report_for_record(record)
        score_breakdown = self._score_breakdown_from_record(record)
        all_rules: list[dict[str, Any]] = score_breakdown.get("rules") or []
        matched_rules = [rule for rule in all_rules if rule.get("matched")]
        applied_rules = [rule for rule in all_rules if rule.get("applied")]
        raw_features = record.raw_features_json or {}
        actions = self.report_actions(materialized_report.id)
        plugin_events = self.db.query(PluginSyncEvent).filter(
            PluginSyncEvent.scan_record_id == record.id
        ).order_by(desc(PluginSyncEvent.created_at)).all()

        evidence = [
            {
                "title": "Rule score",
                "summary": f"{len(all_rules)} rules displayed, {len(matched_rules)} matched, {len(applied_rules)} applied.",
                "items": all_rules,
            },
            {
                "title": "DeepSeek semantic analysis",
                "summary": score_breakdown.get("fusion_summary", ""),
                "items": [score_breakdown.get("ai_analysis", {})],
            },
            {
                "title": "Page signals",
                "summary": "URL, title, forms, buttons, inputs and password-input signals captured for audit.",
                "items": [score_breakdown["raw_features"]],
            },
        ]

        return {
            "id": materialized_report.id,
            "scan_record_id": record.id,
            "record_id": record.id,
            "url": record.url,
            "domain": record.domain,
            "host": record.domain,
            "title": record.title,
            "source": record.source,
            "label": record.label,
            "risk_level": record.label,
            "label_text": self._risk_text(record.label),
            "risk_score": record.risk_score,
            "rule_score": record.rule_score,
            "behavior_score": score_breakdown.get("behavior_score", record.rule_score),
            "behavior_signals": score_breakdown.get("behavior_signals", []),
            "ai_score": score_breakdown.get("ai_score"),
            "ai_analysis": score_breakdown.get("ai_analysis", {}),
            "ai_fusion_used": bool(score_breakdown.get("ai_fusion_used", False)),
            "fallback": score_breakdown.get("fallback"),
            "policy_hit": score_breakdown.get("policy_hit", {}),
            "threat_intel_hit": bool(score_breakdown.get("threat_intel_hit", False)),
            "threat_intel_matches": score_breakdown.get("threat_intel_matches", []),
            "model_score": score_breakdown.get("ai_score"),
            "model_probs": {
                "safe": record.model_safe_prob,
                "suspicious": record.model_suspicious_prob,
                "malicious": record.model_malicious_prob,
            },
            "model_breakdown": None,
            "score_breakdown": score_breakdown,
            "hit_rules": all_rules,
            "matched_rules": matched_rules,
            "applied_rules": applied_rules,
            "summary": record.explanation,
            "explanation": record.explanation,
            "recommendation": record.recommendation,
            "conclusion": self._conclusion(record.label),
            "evidence": evidence,
            "raw_features": raw_features,
            "actions": [
                {
                    "id": action.id,
                    "report_id": action.report_id,
                    "actor": action.actor,
                    "actor_role": action.actor_role,
                    "action_type": action.action_type,
                    "status": action.status,
                    "note": action.note,
                    "created_at": action.created_at,
                }
                for action in actions
            ],
            "plugin_events": [
                {
                    "id": event.id,
                    "user_id": event.user_id,
                    "username": event.username,
                    "event_type": event.event_type,
                    "action": event.action,
                    "url": event.url,
                    "host": event.host or event.domain,
                    "domain": event.domain,
                    "risk_level": event.risk_level or event.risk_label,
                    "risk_label": event.risk_label or event.risk_level,
                    "risk_score": event.risk_score,
                    "summary": event.summary,
                    "scan_record_id": event.scan_record_id,
                    "plugin_version": event.plugin_version,
                    "source": event.source,
                    "payload": event.payload,
                    "metadata_json": event.metadata_json,
                    "created_at": event.created_at,
                }
                for event in plugin_events
            ],
            "created_at": record.created_at,
        }

    def _score_breakdown_from_record(self, record: ScanRecord) -> dict[str, Any]:
        ensure_default_rules(self.db)
        persisted = record.raw_features_json or {}
        persisted_breakdown = persisted.get("score_breakdown") if isinstance(persisted.get("score_breakdown"), dict) else {}
        raw_rules = persisted_breakdown.get("rules") or record.hit_rules_json or []
        rule_keys = [rule.get("rule_key") for rule in raw_rules if rule.get("rule_key")]
        configs_by_key = {
            rule.rule_key: rule
            for rule in self.db.query(RuleConfig).filter(RuleConfig.rule_key.in_(rule_keys)).all()
        } if rule_keys else {}
        rules = [self._normalize_rule_detail(rule, configs_by_key.get(rule.get("rule_key"))) for rule in raw_rules]
        raw_rule_total = sum(float(rule.get("contribution") or 0) for rule in rules if rule.get("enabled", True))
        enabled_weight_total = sum(float(rule.get("weight") or 0) for rule in rules if rule.get("enabled", True)) or 0
        behavior_score = float(persisted_breakdown.get("behavior_score", persisted.get("behavior_score", record.rule_score or 0)) or 0)
        behavior_signals = persisted_breakdown.get("behavior_signals") or persisted.get("behavior_signals") or [
            {
                "rule_key": rule.get("rule_key"),
                "rule_name": rule.get("rule_name") or rule.get("name"),
                "matched": bool(rule.get("matched")),
                "severity": rule.get("severity"),
                "category": rule.get("category"),
                "score": float(rule.get("contribution") or rule.get("weighted_score") or 0),
                "evidence": rule.get("evidence") or rule.get("raw_feature") or {},
                "reason": rule.get("reason") or rule.get("detail"),
                "caution": bool(rule.get("caution", False)),
                "false_positive_note": rule.get("false_positive_note"),
            }
            for rule in rules
            if rule.get("matched")
        ]
        ai_analysis = persisted_breakdown.get("ai_analysis") or persisted.get("ai_analysis") or {
            "status": "not_available",
            "provider": "deepseek",
            "model": None,
            "risk_score": None,
            "label": None,
            "risk_types": [],
            "reasons": [],
            "recommendation": "",
            "confidence": 0.0,
            "error": None,
            "trigger_reasons": [],
            "reason": "本报告未保存结构化 AI 分析详情，仅保留融合解释文本。",
        }
        ai_score = persisted_breakdown.get("ai_score", persisted.get("ai_score"))
        if ai_score is None and ai_analysis.get("status") == "used":
            ai_score = ai_analysis.get("risk_score")
        ai_score = float(ai_score) if ai_score is not None else None
        ai_fusion_used = bool(
            persisted_breakdown.get(
                "ai_fusion_used",
                persisted.get("ai_fusion_used", ai_analysis.get("status") == "used" and ai_score is not None),
            )
        )
        fallback = persisted_breakdown.get("fallback", persisted.get("fallback"))
        if not ai_fusion_used and fallback is None:
            fallback = "rule_engine_only"
        final_score = float(persisted_breakdown.get("final_score", record.risk_score or 0) or 0)
        fusion_summary = persisted_breakdown.get("fusion_summary")
        if not fusion_summary:
            fusion_summary = (
                "最终风险分 = 行为规则分 × 45% + DeepSeek 语义分 × 55%"
                if ai_fusion_used
                else "DeepSeek 未触发或不可用，系统使用规则引擎兜底。"
            )
        return {
            "rule_score_total": behavior_score,
            "rule_score_raw_total": float(persisted_breakdown.get("rule_score_raw_total", raw_rule_total) or 0),
            "enabled_rule_weight_total": float(persisted_breakdown.get("enabled_rule_weight_total", enabled_weight_total) or 0),
            "behavior_score": behavior_score,
            "behavior_signals": behavior_signals,
            "ai_provider": "deepseek",
            "ai_score": ai_score,
            "ai_analysis": ai_analysis,
            "ai_fusion_used": ai_fusion_used,
            "fallback": fallback,
            "final_score": final_score,
            "label": persisted_breakdown.get("label", record.label),
            "fusion_summary": fusion_summary,
            "rules": rules,
            "raw_features": self._raw_feature_summary(record),
            "policy_hit": persisted_breakdown.get("policy_hit") or persisted.get("policy_hit") or {},
            "threat_intel_hit": bool(persisted_breakdown.get("threat_intel_hit", persisted.get("threat_intel_hit", False))),
            "threat_intel_matches": persisted_breakdown.get("threat_intel_matches") or persisted.get("threat_intel_matches") or [],
        }

    def _normalize_rule_detail(self, rule: dict[str, Any], current_config: RuleConfig | None = None) -> dict[str, Any]:
        name = rule.get("name") or rule.get("rule_name") or rule.get("rule_key") or "Unnamed rule"
        if current_config is not None:
            name = current_config.rule_name or name
        contribution = float(rule.get("contribution", rule.get("weighted_score", 0)) or 0)
        weight = float(rule.get("weight", rule.get("weighted_score", 0)) or 0)
        return {
            "id": rule.get("id"),
            "rule_key": rule.get("rule_key", ""),
            "rule_name": name,
            "name": name,
            "description": getattr(current_config, "description", None) if current_config else rule.get("description"),
            "matched": bool(rule.get("matched")),
            "enabled": bool(getattr(current_config, "enabled", rule.get("enabled", True))),
            "applied": bool(rule.get("applied", bool(rule.get("matched")) and bool(rule.get("enabled", True)))),
            "weight": float(getattr(current_config, "weight", weight) or 0),
            "threshold": float(getattr(current_config, "threshold", rule.get("threshold", 0)) or 0),
            "contribution": contribution,
            "weighted_score": contribution,
            "raw_score": float(rule.get("raw_score", 1.0 if rule.get("matched") else 0.0) or 0),
            "reason": rule.get("reason") or rule.get("detail") or "No rule detail recorded",
            "detail": rule.get("detail") or rule.get("reason") or "No rule detail recorded",
            "category": getattr(current_config, "category", None) or rule.get("category") or "legacy",
            "severity": getattr(current_config, "severity", None) or rule.get("severity") or "medium",
            "raw_feature": rule.get("raw_feature") or {},
            "observed_value": rule.get("observed_value"),
        }

    def _raw_feature_summary(self, record: ScanRecord) -> dict[str, Any]:
        raw_features = record.raw_features_json or {}
        return {
            "url": raw_features.get("url") or record.url,
            "domain": raw_features.get("domain") or record.domain,
            "title": raw_features.get("title") or record.title or "",
            "has_password_input": bool(raw_features.get("has_password_input", record.has_password_input)),
            "form_action_domains": raw_features.get("form_action_domains") or [],
            "button_texts": raw_features.get("button_texts") or [],
            "input_labels": raw_features.get("input_labels") or [],
            "visible_text_length": len(raw_features.get("visible_text") or ""),
            "text_length": len(
                " ".join(
                    [
                        str(raw_features.get("title") or ""),
                        str(raw_features.get("visible_text") or ""),
                        " ".join(raw_features.get("button_texts") or []),
                        " ".join(raw_features.get("input_labels") or []),
                    ]
                )
            ),
        }

    def _risk_text(self, label: str) -> str:
        return {"safe": "安全", "suspicious": "可疑", "malicious": "恶意"}.get(label, "未知")

    def _conclusion(self, label: str) -> str:
        if label == "malicious":
            return "该网站被判定为高风险，建议阻止访问并复核命中规则与页面信号。"
        if label == "suspicious":
            return "该网站存在可疑信号，建议谨慎访问并避免输入敏感信息。"
        return "当前未发现足够高的风险信号，但仍建议保持基础安全习惯。"
