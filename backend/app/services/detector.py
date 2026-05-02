from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..core.exceptions import DatabaseError, RuleEngineError
from ..models import DomainBlacklist, DomainWhitelist, Report, ScanRecord, User, UserSiteStrategy
from .ai_config_service import AIConfigService
from .deepseek_analysis_service import DeepSeekAnalysisService
from .feature_extractor import FeatureExtractor
from .rule_engine import RuleEngine
from .threat_intel_service import THREAT_INTEL_SOURCE_PREFIX


class Detector:
    """Detection pipeline: feature extraction, rules, DeepSeek semantic analysis, and policy output."""

    def __init__(self, db: Session):
        self.db = db
        self.feature_extractor = FeatureExtractor()
        self.rule_engine = RuleEngine(db)
        self.ai_config_service = AIConfigService(db)
        self.ai_analysis_service: DeepSeekAnalysisService | None = None

    def _check_domain_lists(self, domain: str, username: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            if username:
                now = datetime.now(timezone.utc)
                user_strategy = (
                    self.db.query(UserSiteStrategy)
                    .filter(
                        UserSiteStrategy.username == username,
                        UserSiteStrategy.domain == domain,
                        UserSiteStrategy.is_active.is_(True),
                        UserSiteStrategy.strategy_type.in_(["trusted", "blocked", "paused"]),
                    )
                    .filter((UserSiteStrategy.expires_at.is_(None)) | (UserSiteStrategy.expires_at > now))
                    .order_by(UserSiteStrategy.updated_at.desc())
                    .first()
                )
                if user_strategy:
                    if user_strategy.strategy_type == "blocked":
                        reason = f"Domain matches your blocked-site policy: {user_strategy.reason or 'user policy'}"
                        return {
                            "label": "malicious",
                            "reason": reason,
                            "policy_hit": {
                                "hit": True,
                                "scope": "user",
                                "list_type": "blocked",
                                "source": user_strategy.source or "user_policy",
                                "reason": reason,
                            },
                        }
                    policy_name = "temporary bypass" if user_strategy.strategy_type == "paused" else "trusted site"
                    list_type = "temporary_trust" if user_strategy.strategy_type == "paused" else "trusted"
                    reason = f"Domain matches your {policy_name} policy: {user_strategy.reason or 'user policy'}"
                    return {
                        "label": "safe",
                        "reason": reason,
                        "policy_hit": {
                            "hit": True,
                            "scope": "user",
                            "list_type": list_type,
                            "source": user_strategy.source or "user_policy",
                            "reason": reason,
                        },
                    }

            blacklist = (
                self.db.query(DomainBlacklist)
                .filter(
                    DomainBlacklist.domain == domain,
                    DomainBlacklist.status == "active",
                )
                .first()
            )
            if blacklist:
                is_threat_intel = bool((blacklist.source or "").startswith(THREAT_INTEL_SOURCE_PREFIX))
                reason = blacklist.reason or "no reason provided"
                display_reason = (
                    reason
                    if is_threat_intel
                    else f"Domain is in the global blacklist: {reason}"
                )
                threat_intel_matches = (
                    [
                        {
                            "domain": blacklist.domain,
                            "source": blacklist.source,
                            "risk_type": blacklist.risk_type,
                            "reason": reason,
                        }
                    ]
                    if is_threat_intel
                    else []
                )
                return {
                    "label": "malicious",
                    "reason": display_reason,
                    "threat_intel_matches": threat_intel_matches,
                    "policy_hit": {
                        "hit": True,
                        "scope": "global",
                        "list_type": "blocked",
                        "source": blacklist.source or "admin",
                        "reason": display_reason,
                    },
                }

            whitelist = (
                self.db.query(DomainWhitelist)
                .filter(
                    DomainWhitelist.domain == domain,
                    DomainWhitelist.status == "active",
                )
                .first()
            )
            if whitelist:
                reason = f"Domain is in the global whitelist: {whitelist.reason or 'no reason provided'}"
                return {
                    "label": "safe",
                    "reason": reason,
                    "policy_hit": {
                        "hit": True,
                        "scope": "global",
                        "list_type": "trusted",
                        "source": whitelist.source or "admin",
                        "reason": reason,
                    },
                }

            return None
        except SQLAlchemyError as exc:
            raise DatabaseError(f"Failed to query domain lists: {exc}") from exc

    def _run_detection_pipeline(self, features: Dict[str, Any]) -> Dict[str, Any]:
        try:
            rule_result = self.rule_engine.execute_rules(features)
            rule_details = rule_result["rules"]
            rule_score = self._behavior_score(rule_result)
        except Exception as exc:
            raise RuleEngineError(f"Rule engine execution failed: {exc}") from exc

        behavior_signals = self._build_behavior_signals(rule_details)
        ai_service = self.ai_analysis_service or self.ai_config_service.build_analysis_service()
        ai_analysis = ai_service.analyze(
            features=features,
            behavior_score=rule_score,
            behavior_signals=behavior_signals,
            threat_intel_hit=False,
        )
        ai_score = self._extract_ai_score(ai_analysis)
        ai_fusion_used = ai_score is not None and ai_analysis.get("status") == "used"
        fuse_result = self._fuse_ai_decision(rule_score, ai_score) if ai_fusion_used else self._rule_only_decision(rule_score)
        fusion_summary = (
            "最终风险分 = 行为规则分 × 45% + DeepSeek 语义分 × 55%"
            if ai_fusion_used
            else "DeepSeek 未触发或不可用，系统使用规则引擎兜底。"
        )
        score_breakdown = self._build_score_breakdown(
            rules=rule_details,
            behavior_score=rule_score,
            rule_score_total=rule_result["rule_score_total"],
            enabled_weight_total=rule_result["enabled_weight_total"],
            final_score=fuse_result["risk_score"],
            label=fuse_result["label"],
            raw_feature_summary=rule_result["raw_feature_summary"],
            behavior_signals=behavior_signals,
            ai_score=ai_score,
            ai_analysis=ai_analysis,
            ai_fusion_used=ai_fusion_used,
            fallback=None if ai_fusion_used else "rule_engine_only",
            fusion_summary=fusion_summary,
        )

        explanation = self._generate_explanation(rule_details, score_breakdown, ai_analysis=ai_analysis)
        recommendation = (
            ai_analysis.get("recommendation")
            if ai_fusion_used and ai_analysis.get("recommendation")
            else self._generate_recommendation(fuse_result["label"], fuse_result["risk_score"])
        )

        return {
            "fuse_result": fuse_result,
            "rule_score": rule_score,
            "hit_rules": rule_details,
            "ai_score": ai_score,
            "ai_analysis": ai_analysis,
            "score_breakdown": score_breakdown,
            "explanation": explanation,
            "recommendation": recommendation,
        }

    def _extract_ai_score(self, ai_analysis: dict[str, Any]) -> Optional[float]:
        if ai_analysis.get("status") != "used":
            return None
        risk_score = ai_analysis.get("risk_score")
        if risk_score is None:
            return None
        return max(0.0, min(100.0, float(risk_score)))

    def _decision_flags(self, label: str) -> tuple[str, bool, bool]:
        if label == "malicious":
            return "BLOCK", True, True
        if label == "suspicious":
            return "WARN", True, False
        return "ALLOW", False, False

    def _summarize_reasons(self, hit_rules: list[dict[str, Any]]) -> list[str]:
        reasons: list[str] = []
        for rule in hit_rules:
            if not rule.get("matched"):
                continue
            reason = (
                str(
                    rule.get("reason")
                    or rule.get("detail")
                    or rule.get("name")
                    or rule.get("rule_name")
                    or ""
                )
                .strip()
            )
            if reason and reason not in reasons:
                reasons.append(reason)
            if len(reasons) >= 3:
                break
        return reasons

    def _build_summary(
        self,
        *,
        label: str,
        reason_summary: list[str],
        explanation: str,
        domain_list_reason: Optional[str] = None,
    ) -> str:
        if domain_list_reason:
            return domain_list_reason
        if reason_summary:
            return "；".join(reason_summary[:2])
        if explanation:
            first_line = explanation.splitlines()[0].strip()
            if first_line:
                return first_line
        if label == "malicious":
            return "Detected high-risk signals and blocked the page."
        if label == "suspicious":
            return "Detected suspicious signals and recommend warning the user."
        return "No obvious high-risk signal was detected."

    def _empty_policy_hit(self) -> dict[str, Any]:
        return {
            "hit": False,
            "scope": None,
            "list_type": None,
            "source": None,
            "reason": None,
        }

    def _phase1_ai_analysis(self) -> dict[str, Any]:
        return {
            "status": "not_triggered",
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
            "reason": "DeepSeek 未触发或不可用，系统使用规则引擎兜底。",
        }

    def _build_behavior_signals(self, hit_rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
        signals: list[dict[str, Any]] = []
        for rule in hit_rules:
            if not rule.get("matched"):
                continue
            signals.append(
                {
                    "rule_key": rule.get("rule_key"),
                    "rule_name": rule.get("rule_name") or rule.get("name"),
                    "matched": True,
                    "severity": rule.get("severity"),
                    "category": rule.get("category"),
                    "score": float(rule.get("contribution", rule.get("weighted_score", 0.0)) or 0.0),
                    "evidence": rule.get("evidence") or rule.get("raw_feature") or {},
                    "reason": rule.get("reason") or rule.get("detail"),
                    "caution": bool(rule.get("caution", False)),
                    "false_positive_note": rule.get("false_positive_note"),
                }
            )
        return signals

    def _behavior_score(self, rule_result: dict[str, Any]) -> float:
        base_score = float(rule_result.get("rule_score") or 0.0)
        raw_total = float(rule_result.get("rule_score_total") or 0.0)
        matched_rules = [
            rule
            for rule in (rule_result.get("rules") or [])
            if rule.get("matched") and rule.get("enabled", True)
        ]
        high_risk_combo = any(
            rule.get("category") == "combo" and rule.get("severity") in {"high", "critical"}
            for rule in matched_rules
        )
        if high_risk_combo:
            return min(100.0, max(base_score, raw_total * 1.35))
        return min(100.0, max(0.0, base_score))

    def _with_phase1_compat_fields(
        self,
        result: Dict[str, Any],
        policy_hit: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        enriched = dict(result)
        hit_rules = list(enriched.get("hit_rules") or [])
        behavior_score = float(enriched.get("rule_score") or 0.0)
        behavior_signals = self._build_behavior_signals(hit_rules)
        ai_analysis = dict(enriched.get("ai_analysis") or self._phase1_ai_analysis())
        ai_score = self._extract_ai_score(ai_analysis)
        threat_intel_matches = list(enriched.get("threat_intel_matches") or [])
        threat_intel_hit = bool(threat_intel_matches)

        enriched["policy_hit"] = policy_hit or self._empty_policy_hit()
        enriched["threat_intel_hit"] = threat_intel_hit
        enriched["threat_intel_matches"] = threat_intel_matches
        enriched["behavior_score"] = behavior_score
        enriched["behavior_signals"] = behavior_signals
        enriched["ai_score"] = ai_score
        enriched["ai_analysis"] = ai_analysis

        score_breakdown = dict(enriched.get("score_breakdown") or {})
        score_breakdown.setdefault("ai_fusion_used", bool(ai_score is not None and ai_analysis.get("status") == "used"))
        if ai_score is None:
            score_breakdown.setdefault("fallback", "rule_engine_only")
        score_breakdown.update(
            {
                "ai_provider": "deepseek",
                "policy_hit": enriched["policy_hit"],
                "threat_intel_hit": threat_intel_hit,
                "threat_intel_matches": threat_intel_matches,
                "behavior_score": behavior_score,
                "behavior_signals": behavior_signals,
                "ai_score": ai_score,
                "ai_analysis": ai_analysis,
            }
        )
        enriched["score_breakdown"] = score_breakdown
        enriched["ai_fusion_used"] = bool(score_breakdown.get("ai_fusion_used", False))
        enriched["fallback"] = score_breakdown.get("fallback")
        return enriched

    def _attach_result_metadata(
        self,
        *,
        result: Dict[str, Any],
        url: str,
        domain: str,
        record: ScanRecord,
    ) -> Dict[str, Any]:
        action, should_warn, should_block = self._decision_flags(result["label"])
        enriched = dict(result)
        enriched.update(
            {
                "url": url,
                "domain": domain,
                "action": action,
                "should_warn": should_warn,
                "should_block": should_block,
                "record_id": record.id,
                "report_id": record.report_id or record.id,
            }
        )
        return enriched

    def _build_result(
        self,
        domain_list_result: Optional[Dict[str, Any]],
        pipeline_result: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if domain_list_result:
            label = domain_list_result["label"]
            risk_score = 100.0 if label == "malicious" else 0.0
            score_breakdown = self._build_score_breakdown(
                rules=[],
                behavior_score=0.0,
                rule_score_total=0.0,
                enabled_weight_total=0.0,
                final_score=risk_score,
                label=label,
                raw_feature_summary={},
                behavior_signals=[],
                ai_score=None,
                ai_analysis=self._phase1_ai_analysis(),
                ai_fusion_used=False,
                fallback="rule_engine_only",
                fusion_summary=(
                    f"Decision was short-circuited by a domain list policy and marked as {label}. "
                    "DeepSeek 未触发或不可用，系统使用规则引擎兜底。"
                ),
            )
            reason_summary = [domain_list_result["reason"]]
            model_probs = self._compat_probs_for_label(label)
            result = {
                "label": label,
                "risk_score": risk_score,
                "summary": self._build_summary(
                    label=label,
                    reason_summary=reason_summary,
                    explanation=domain_list_result["reason"],
                    domain_list_reason=domain_list_result["reason"],
                ),
                "reason_summary": reason_summary,
                "rule_score": 0.0,
                "model_safe_prob": model_probs["safe_prob"],
                "model_suspicious_prob": model_probs["suspicious_prob"],
                "model_malicious_prob": model_probs["malicious_prob"],
                "hit_rules": [],
                "threat_intel_matches": domain_list_result.get("threat_intel_matches", []),
                "score_breakdown": score_breakdown,
                "explanation": domain_list_result["reason"],
                "recommendation": self._generate_recommendation(label, risk_score),
            }
            return self._with_phase1_compat_fields(
                result,
                policy_hit=domain_list_result.get("policy_hit"),
            )

        if pipeline_result:
            fuse_result = pipeline_result["fuse_result"]
            reason_summary = self._summarize_reasons(pipeline_result["hit_rules"])
            model_probs = self._compat_probs_for_label(fuse_result["label"])
            result = {
                "label": fuse_result["label"],
                "risk_score": fuse_result["risk_score"],
                "summary": self._build_summary(
                    label=fuse_result["label"],
                    reason_summary=reason_summary,
                    explanation=pipeline_result["explanation"],
                ),
                "reason_summary": reason_summary,
                "rule_score": pipeline_result["rule_score"],
                "model_safe_prob": model_probs["safe_prob"],
                "model_suspicious_prob": model_probs["suspicious_prob"],
                "model_malicious_prob": model_probs["malicious_prob"],
                "hit_rules": pipeline_result["hit_rules"],
                "ai_score": pipeline_result.get("ai_score"),
                "ai_analysis": pipeline_result.get("ai_analysis"),
                "score_breakdown": pipeline_result["score_breakdown"],
                "explanation": pipeline_result["explanation"],
                "recommendation": pipeline_result["recommendation"],
            }
            return self._with_phase1_compat_fields(result)

        result = {
            "label": "safe",
            "risk_score": 0.0,
            "summary": "No obvious high-risk signal was detected.",
            "reason_summary": [],
            "rule_score": 0.0,
            "model_safe_prob": 1.0,
            "model_suspicious_prob": 0.0,
            "model_malicious_prob": 0.0,
            "hit_rules": [],
            "score_breakdown": {},
            "explanation": "Detection has not been executed yet.",
            "recommendation": "No obvious high-risk signal was detected. Continue browsing with normal caution.",
        }
        return self._with_phase1_compat_fields(result)

    def _resolve_user_id(self, username: Optional[str]) -> Optional[int]:
        if not username:
            return None
        user = self.db.query(User).filter(User.username == username).first()
        if not user:
            user = User(username=username, display_name=username, role="user")
            self.db.add(user)
            self.db.flush()
        return user.id

    def _create_report_for_record(self, record: ScanRecord, user_id: Optional[int]) -> Report:
        existing = self.db.query(Report).filter(Report.scan_record_id == record.id).first()
        if existing:
            return existing
        report = Report(
            scan_record_id=record.id,
            user_id=user_id,
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
        return report

    def _persisted_detection_snapshot(self, raw_features: dict[str, Any], result: Dict[str, Any]) -> dict[str, Any]:
        score_breakdown = dict(result.get("score_breakdown") or {})
        return {
            **raw_features,
            "score_breakdown": score_breakdown,
            "ai_score": result.get("ai_score"),
            "ai_analysis": result.get("ai_analysis") or score_breakdown.get("ai_analysis") or {},
            "ai_fusion_used": bool(score_breakdown.get("ai_fusion_used", False)),
            "fallback": score_breakdown.get("fallback"),
            "behavior_score": result.get("behavior_score", result.get("rule_score")),
            "behavior_signals": result.get("behavior_signals") or score_breakdown.get("behavior_signals") or [],
            "policy_hit": result.get("policy_hit") or score_breakdown.get("policy_hit") or self._empty_policy_hit(),
            "threat_intel_hit": bool(result.get("threat_intel_hit", score_breakdown.get("threat_intel_hit", False))),
            "threat_intel_matches": result.get("threat_intel_matches") or score_breakdown.get("threat_intel_matches") or [],
        }

    def _save_record(
        self,
        url: str,
        domain: str,
        features: Dict[str, Any],
        result: Dict[str, Any],
        source: str,
        username: Optional[str],
    ) -> ScanRecord:
        try:
            user_id = self._resolve_user_id(username)
            record = ScanRecord(
                user_id=user_id,
                url=url,
                domain=domain,
                title=features["raw_features"].get("title"),
                source=source,
                label=result["label"],
                risk_score=result["risk_score"],
                rule_score=result["rule_score"],
                model_safe_prob=result["model_safe_prob"],
                model_suspicious_prob=result["model_suspicious_prob"],
                model_malicious_prob=result["model_malicious_prob"],
                has_password_input=bool(features.get("has_password_input", False)),
                hit_rules_json=result["hit_rules"],
                raw_features_json=self._persisted_detection_snapshot(features["raw_features"], result),
                explanation=result["explanation"],
                recommendation=result["recommendation"],
            )
            self.db.add(record)
            self.db.flush()
            self._create_report_for_record(record, user_id)
            self.db.commit()
            self.db.refresh(record)
            return record
        except SQLAlchemyError as exc:
            self.db.rollback()
            raise DatabaseError(f"Failed to save scan record: {exc}") from exc

    def _label_for_score(self, risk_score: float) -> str:
        if risk_score >= 70:
            return "malicious"
        if risk_score >= 40:
            return "suspicious"
        return "safe"

    def _rule_only_decision(self, behavior_score: float) -> Dict[str, Any]:
        risk_score = min(100.0, max(0.0, float(behavior_score or 0.0)))
        return {
            "label": self._label_for_score(risk_score),
            "risk_score": risk_score,
        }

    def _fuse_ai_decision(self, behavior_score: float, ai_score: float) -> Dict[str, Any]:
        risk_score = min(100.0, max(0.0, (behavior_score * 0.45) + (ai_score * 0.55)))
        return {
            "label": self._label_for_score(risk_score),
            "risk_score": risk_score,
            "ai_score": ai_score,
        }

    def _compat_probs_for_label(self, label: str) -> Dict[str, float]:
        return {
            "safe_prob": 1.0 if label == "safe" else 0.0,
            "suspicious_prob": 1.0 if label == "suspicious" else 0.0,
            "malicious_prob": 1.0 if label == "malicious" else 0.0,
        }

    def _build_score_breakdown(
        self,
        *,
        rules: list[dict[str, Any]],
        behavior_score: float,
        rule_score_total: float,
        enabled_weight_total: float,
        final_score: float,
        label: str,
        raw_feature_summary: Optional[dict[str, Any]],
        behavior_signals: list[dict[str, Any]],
        ai_score: Optional[float],
        ai_analysis: dict[str, Any],
        ai_fusion_used: bool,
        fallback: Optional[str],
        fusion_summary: str,
    ) -> dict[str, Any]:
        return {
            "rule_score_total": behavior_score,
            "rule_score_raw_total": rule_score_total,
            "enabled_rule_weight_total": enabled_weight_total,
            "behavior_score": behavior_score,
            "behavior_signals": behavior_signals,
            "ai_provider": "deepseek",
            "ai_score": ai_score,
            "ai_analysis": ai_analysis,
            "ai_fusion_used": ai_fusion_used,
            "fallback": fallback,
            "final_score": final_score,
            "label": label,
            "fusion_summary": fusion_summary,
            "rules": rules,
            "raw_features": raw_feature_summary or {},
        }

    def _generate_explanation(
        self,
        rule_details: list[dict[str, Any]],
        breakdown: dict[str, Any],
        *,
        ai_analysis: Optional[dict[str, Any]] = None,
    ) -> str:
        matched_rules = [rule for rule in rule_details if rule.get("matched") and rule.get("enabled")]
        lines = [
            f"规则引擎行为分: {breakdown.get('behavior_score', breakdown.get('rule_score_total', 0)):.1f}",
            f"最终风险分: {breakdown.get('final_score', 0):.1f}",
        ]
        if matched_rules:
            lines.append(f"命中并参与评分的规则: {len(matched_rules)}")
            for rule in matched_rules[:5]:
                lines.append(
                    f"- {rule.get('name') or rule.get('rule_name')}: "
                    f"+{rule.get('contribution', 0):.1f}; {rule.get('reason')}"
                )
        else:
            lines.append("No enabled scoring rule was matched.")

        lines.append(str(breakdown.get("fusion_summary", "")))
        if ai_analysis:
            status = ai_analysis.get("status")
            lines.append(f"DeepSeek 语义研判状态: {status}")
            if status == "used":
                lines.append(
                    f"DeepSeek 风险分: {ai_analysis.get('risk_score')}; confidence={ai_analysis.get('confidence', 0):.2f}"
                )
                for reason in (ai_analysis.get("reasons") or [])[:3]:
                    lines.append(f"- DeepSeek: {reason}")
            elif ai_analysis.get("reason"):
                lines.append(f"DeepSeek 兜底说明: {ai_analysis.get('reason')}")
        return "\n".join(lines)

    def _generate_recommendation(self, label: str, risk_score: float) -> str:
        if label == "malicious":
            return (
                "不要继续访问该网站。避免输入密码、验证码、支付信息或其他敏感数据。"
            )
        if label == "suspicious":
            return (
                "请谨慎访问。在输入任何敏感信息前，先核对域名、证书和页面来源。"
            )
        return "未发现明显高风险信号，可继续访问但仍需保持基础安全习惯。"

    def detect_url(self, url: str, source: str = "manual", username: Optional[str] = None) -> Dict[str, Any]:
        features = self.feature_extractor.extract_features(url)
        normalized_url = str(features["raw_features"].get("url") or url)
        domain = features["domain"]

        domain_list_result = self._check_domain_lists(domain, username)
        if domain_list_result:
            result = self._build_result(domain_list_result, None)
            record = self._save_record(normalized_url, domain, features, result, source, username)
            return self._attach_result_metadata(result=result, url=normalized_url, domain=domain, record=record)

        pipeline_result = self._run_detection_pipeline(features)
        result = self._build_result(None, pipeline_result)
        record = self._save_record(normalized_url, domain, features, result, source, username)
        return self._attach_result_metadata(result=result, url=normalized_url, domain=domain, record=record)

    def detect_page(self, page_data: Dict[str, Any], source: str = "plugin", username: Optional[str] = None) -> Dict[str, Any]:
        url = page_data["url"]
        features = self.feature_extractor.extract_features(
            url,
            page_data.get("title") or "",
            page_data.get("visible_text") or "",
            page_data.get("button_texts") or [],
            page_data.get("input_labels") or [],
            page_data.get("form_action_domains") or [],
            bool(page_data.get("has_password_input")),
        )
        normalized_url = str(features["raw_features"].get("url") or url)
        domain = features["domain"]

        domain_list_result = self._check_domain_lists(domain, username)
        if domain_list_result:
            result = self._build_result(domain_list_result, None)
            record = self._save_record(normalized_url, domain, features, result, source, username)
            return self._attach_result_metadata(result=result, url=normalized_url, domain=domain, record=record)

        pipeline_result = self._run_detection_pipeline(features)
        result = self._build_result(None, pipeline_result)
        record = self._save_record(normalized_url, domain, features, result, source, username)
        return self._attach_result_metadata(result=result, url=normalized_url, domain=domain, record=record)
