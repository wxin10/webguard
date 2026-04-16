from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..core.exceptions import DatabaseError, ModelServiceError, RuleEngineError
from ..models import DomainBlacklist, DomainWhitelist, ScanRecord, UserSiteStrategy
from .feature_extractor import FeatureExtractor
from .model_service import ModelService
from .rule_engine import RuleEngine, build_score_breakdown


class Detector:
    """Detection pipeline: feature extraction, rules, model, and fusion."""

    def __init__(self, db: Session):
        self.db = db
        self.feature_extractor = FeatureExtractor()
        self.rule_engine = RuleEngine(db)
        self.model_service = ModelService(db)

    def _check_domain_lists(self, domain: str, username: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            if username:
                now = datetime.now(timezone.utc)
                user_strategy = self.db.query(UserSiteStrategy).filter(
                    UserSiteStrategy.username == username,
                    UserSiteStrategy.domain == domain,
                    UserSiteStrategy.is_active.is_(True),
                    UserSiteStrategy.strategy_type.in_(["trusted", "blocked", "paused"]),
                ).filter(
                    (UserSiteStrategy.expires_at.is_(None)) | (UserSiteStrategy.expires_at > now)
                ).order_by(UserSiteStrategy.updated_at.desc()).first()
                if user_strategy:
                    if user_strategy.strategy_type == "blocked":
                        return {
                            "label": "malicious",
                            "reason": f"域名命中你的阻止站点策略：{user_strategy.reason or '用户策略'}",
                        }
                    policy_name = "临时忽略" if user_strategy.strategy_type == "paused" else "信任站点"
                    return {
                        "label": "safe",
                        "reason": f"域名命中你的{policy_name}策略：{user_strategy.reason or '用户策略'}",
                    }

            blacklist = self.db.query(DomainBlacklist).filter(DomainBlacklist.domain == domain).first()
            if blacklist:
                return {
                    "label": "malicious",
                    "reason": f"域名在全局黑名单中：{blacklist.reason or '未填写原因'}",
                }

            whitelist = self.db.query(DomainWhitelist).filter(DomainWhitelist.domain == domain).first()
            if whitelist:
                return {
                    "label": "safe",
                    "reason": f"域名在全局白名单中：{whitelist.reason or '未填写原因'}",
                }

            return None
        except SQLAlchemyError as exc:
            raise DatabaseError(f"查询黑白名单失败: {exc}")

    def _run_detection_pipeline(self, features: Dict[str, Any]) -> Dict[str, Any]:
        try:
            rule_result = self.rule_engine.execute_rules(features)
            rule_score = rule_result["rule_score"]
            rule_details = rule_result["rules"]
        except Exception as exc:
            raise RuleEngineError(f"规则引擎执行失败: {exc}")

        try:
            model_input = features["model_input"]
            model_result = self.model_service.predict(model_input)
        except Exception as exc:
            raise ModelServiceError(f"模型推理失败: {exc}")

        fuse_result = self._fuse_decision(rule_score, model_result)
        score_breakdown = build_score_breakdown(
            rules=rule_details,
            rule_score=rule_score,
            rule_score_total=rule_result["rule_score_total"],
            enabled_weight_total=rule_result["enabled_weight_total"],
            model_result=model_result,
            model_score=fuse_result["model_score"],
            final_score=fuse_result["risk_score"],
            label=fuse_result["label"],
            raw_feature_summary=rule_result["raw_feature_summary"],
            fusion_summary=fuse_result["fusion_summary"],
        )

        explanation = self._generate_explanation(rule_details, model_result, score_breakdown)
        recommendation = self._generate_recommendation(fuse_result["label"], fuse_result["risk_score"])

        return {
            "fuse_result": fuse_result,
            "rule_score": rule_score,
            "hit_rules": rule_details,
            "model_result": model_result,
            "score_breakdown": score_breakdown,
            "explanation": explanation,
            "recommendation": recommendation,
        }

    def _build_result(self, domain_list_result: Optional[Dict[str, Any]], pipeline_result: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if domain_list_result:
            label = domain_list_result["label"]
            risk_score = 100.0 if label == "malicious" else 0.0
            model_result = {
                "safe_prob": 1.0 if label == "safe" else 0.0,
                "suspicious_prob": 0.0,
                "malicious_prob": 1.0 if label == "malicious" else 0.0,
                "predicted_label": label,
            }
            model_score = 100.0 if label == "malicious" else 0.0
            score_breakdown = build_score_breakdown(
                rules=[],
                rule_score=0.0,
                rule_score_total=0.0,
                enabled_weight_total=0.0,
                model_result=model_result,
                model_score=model_score,
                final_score=risk_score,
                label=label,
                fusion_summary=f"本次命中名单策略，直接判定为 {label}；规则与模型仅作为记录展示，不参与覆盖名单结果。",
                raw_feature_summary={},
            )
            return {
                "label": label,
                "risk_score": risk_score,
                "rule_score": 0.0,
                "model_safe_prob": model_result["safe_prob"],
                "model_suspicious_prob": 0.0,
                "model_malicious_prob": model_result["malicious_prob"],
                "hit_rules": [],
                "score_breakdown": score_breakdown,
                "explanation": domain_list_result["reason"],
                "recommendation": self._generate_recommendation(label, risk_score),
            }

        if pipeline_result:
            fuse_result = pipeline_result["fuse_result"]
            model_result = pipeline_result["model_result"]
            return {
                "label": fuse_result["label"],
                "risk_score": fuse_result["risk_score"],
                "rule_score": pipeline_result["rule_score"],
                "model_safe_prob": model_result["safe_prob"],
                "model_suspicious_prob": model_result["suspicious_prob"],
                "model_malicious_prob": model_result["malicious_prob"],
                "hit_rules": pipeline_result["hit_rules"],
                "score_breakdown": pipeline_result["score_breakdown"],
                "explanation": pipeline_result["explanation"],
                "recommendation": pipeline_result["recommendation"],
            }

        return {
            "label": "safe",
            "risk_score": 0.0,
            "rule_score": 0.0,
            "model_safe_prob": 1.0,
            "model_suspicious_prob": 0.0,
            "model_malicious_prob": 0.0,
            "hit_rules": [],
            "score_breakdown": {},
            "explanation": "尚未执行检测。",
            "recommendation": "建议：当前未发现明显风险信号。",
        }

    def _save_record(self, url: str, domain: str, features: Dict[str, Any], result: Dict[str, Any], source: str) -> ScanRecord:
        try:
            record = ScanRecord(
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
                raw_features_json=features["raw_features"],
                explanation=result["explanation"],
                recommendation=result["recommendation"],
            )
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
            return record
        except SQLAlchemyError as exc:
            self.db.rollback()
            raise DatabaseError(f"保存扫描记录失败: {exc}")

    def _fuse_decision(self, rule_score: float, model_probs: Dict[str, float]) -> Dict[str, Any]:
        safe_prob = float(model_probs["safe_prob"])
        suspicious_prob = float(model_probs["suspicious_prob"])
        malicious_prob = float(model_probs["malicious_prob"])

        model_score = (malicious_prob * 100.0) + (suspicious_prob * 50.0)
        risk_score = min(100.0, max(0.0, (rule_score * 0.4) + (model_score * 0.6)))

        if risk_score >= 70 or (rule_score >= 65 and malicious_prob >= 0.45) or malicious_prob >= 0.75:
            label = "malicious"
        elif risk_score >= 40 or rule_score >= 35 or suspicious_prob >= 0.5:
            label = "suspicious"
        else:
            label = "safe"

        fusion_summary = (
            f"最终风险分 = 规则分 {rule_score:.1f} x 40% + 模型风险分 {model_score:.1f} x 60%。"
            f" 模型风险分由 malicious 概率 {malicious_prob:.2f} 和 suspicious 概率 {suspicious_prob:.2f} 映射得到。"
            f" 融合后分数为 {risk_score:.1f}，因此标签为 {label}。"
        )
        return {
            "label": label,
            "risk_score": risk_score,
            "model_score": model_score,
            "fusion_summary": fusion_summary,
        }

    def _generate_explanation(self, rule_details: list[dict[str, Any]], model_probs: Dict[str, float], breakdown: dict[str, Any]) -> str:
        matched_rules = [rule for rule in rule_details if rule.get("matched") and rule.get("enabled")]
        lines = [
            f"规则分：{breakdown.get('rule_score_total', 0):.1f}",
            f"模型风险分：{breakdown.get('model_score_total', 0):.1f}",
            f"最终风险分：{breakdown.get('final_score', 0):.1f}",
        ]
        if matched_rules:
            lines.append(f"命中并计分的规则：{len(matched_rules)} 条")
            for rule in matched_rules[:5]:
                lines.append(f"- {rule.get('name') or rule.get('rule_name')}: +{rule.get('contribution', 0):.1f}，{rule.get('reason')}")
        else:
            lines.append("没有命中启用中的计分规则。")

        lines.append(
            "模型概率："
            f"safe={model_probs['safe_prob']:.2f}, "
            f"suspicious={model_probs['suspicious_prob']:.2f}, "
            f"malicious={model_probs['malicious_prob']:.2f}"
        )
        lines.append(str(breakdown.get("fusion_summary", "")))
        return "\n".join(lines)

    def _generate_recommendation(self, label: str, risk_score: float) -> str:
        if label == "malicious":
            return "建议：不要访问该网站，避免输入账号、密码、验证码或支付信息，并交由管理员复核。"
        if label == "suspicious":
            return "建议：谨慎访问，先核验域名、证书和页面来源；如需继续访问，不要输入敏感信息。"
        return "建议：当前未发现明显风险信号，但仍建议保持基础安全习惯。"

    def detect_url(self, url: str, source: str = "manual", username: Optional[str] = None) -> Dict[str, Any]:
        features = self.feature_extractor.extract_features(url)
        domain = features["domain"]

        domain_list_result = self._check_domain_lists(domain, username)
        if domain_list_result:
            result = self._build_result(domain_list_result, None)
            record = self._save_record(url, domain, features, result, source)
            result["record_id"] = record.id
            return result

        pipeline_result = self._run_detection_pipeline(features)
        result = self._build_result(None, pipeline_result)
        record = self._save_record(url, domain, features, result, source)
        result["record_id"] = record.id
        return result

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
        domain = features["domain"]

        domain_list_result = self._check_domain_lists(domain, username)
        if domain_list_result:
            result = self._build_result(domain_list_result, None)
            record = self._save_record(url, domain, features, result, source)
            result["record_id"] = record.id
            return result

        pipeline_result = self._run_detection_pipeline(features)
        result = self._build_result(None, pipeline_result)
        record = self._save_record(url, domain, features, result, source)
        result["record_id"] = record.id
        return result
