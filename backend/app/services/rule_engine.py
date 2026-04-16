from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..models import BrandKeyword, ReportAction, RiskKeyword, RuleConfig, ScanRecord


DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "rule_key": "url_length",
        "rule_name": "URL 长度异常",
        "description": "URL 长度超过阈值时提高风险分。",
        "category": "url",
        "severity": "low",
        "weight": 10.0,
        "threshold": 200.0,
        "enabled": True,
    },
    {
        "rule_key": "ip_direct",
        "rule_name": "URL 使用 IP 地址",
        "description": "检测 URL 是否直接使用 IPv4 地址代替域名。",
        "category": "url",
        "severity": "high",
        "weight": 18.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "suspicious_subdomain",
        "rule_name": "可疑子域名",
        "description": "检测 login、secure、verify 等高风险子域名。",
        "category": "domain",
        "severity": "medium",
        "weight": 12.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "risky_path",
        "rule_name": "高风险路径词",
        "description": "检测路径中是否出现 login、verify、account、secure 等高风险词。",
        "category": "url",
        "severity": "medium",
        "weight": 14.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "password_field",
        "rule_name": "页面含密码输入框",
        "description": "检测页面是否存在密码输入框。",
        "category": "page",
        "severity": "medium",
        "weight": 12.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "cross_domain_form",
        "rule_name": "表单提交跨域",
        "description": "检测表单 action 域名是否与当前域名不一致。",
        "category": "form",
        "severity": "high",
        "weight": 18.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "risky_keywords",
        "rule_name": "页面含高风险诱导词",
        "description": "检测标题、正文、按钮或输入标签中是否出现高风险词。",
        "category": "content",
        "severity": "medium",
        "weight": 14.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "brand_impersonation",
        "rule_name": "疑似品牌冒充",
        "description": "页面出现品牌词但域名不包含对应官方域名关键词时提高风险分。",
        "category": "content",
        "severity": "high",
        "weight": 20.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "title_domain_mismatch",
        "rule_name": "标题与域名匹配度低",
        "description": "页面标题关键词与域名关键词匹配度低于阈值时提高风险分。",
        "category": "content",
        "severity": "low",
        "weight": 8.0,
        "threshold": 0.3,
        "enabled": True,
    },
    {
        "rule_key": "suspicious_redirect",
        "rule_name": "可疑跳转提示",
        "description": "检测页面文本是否提示跳转、重定向或倒计时。",
        "category": "behavior",
        "severity": "medium",
        "weight": 10.0,
        "threshold": 1.0,
        "enabled": True,
    },
]


DEFAULT_BRAND_DOMAIN_MAP: dict[str, list[str]] = {
    "google": ["google", "gmail", "youtube"],
    "github": ["github"],
    "microsoft": ["microsoft", "live", "office"],
    "paypal": ["paypal"],
    "apple": ["apple", "icloud"],
    "amazon": ["amazon"],
    "支付宝": ["alipay"],
    "微信": ["wechat", "weixin"],
    "百度": ["baidu", "baidustatic"],
    "腾讯": ["tencent", "qq", "wechat", "weixin"],
    "阿里巴巴": ["alibaba", "taobao", "tmall", "alipay"],
    "淘宝": ["taobao", "tmall"],
    "京东": ["jd"],
}


STATIC_RISK_KEYWORDS = [
    "password",
    "verify",
    "account",
    "login",
    "signin",
    "payment",
    "wallet",
    "bank",
    "urgent",
    "密码",
    "账号",
    "登录",
    "验证",
    "验证码",
    "支付",
    "银行卡",
    "转账",
    "领取",
    "中奖",
]


def _min_count(threshold: Optional[float]) -> int:
    if threshold is None or threshold <= 0:
        return 1
    return max(1, int(threshold))


def _compact_list(items: Iterable[Any], limit: int = 6) -> list[str]:
    values = [str(item).strip() for item in items if str(item).strip()]
    return values[:limit]


def _contains_base_domain(domain: str, action_domain: str) -> bool:
    current = domain.lower().lstrip(".")
    target = action_domain.lower().lstrip(".")
    return target == current or target.endswith("." + current) or current.endswith("." + target)


def ensure_rule_config_schema(db: Session) -> None:
    """Keep older local databases usable after RuleConfig gains new columns."""
    try:
        existing = {column["name"] for column in inspect(db.bind).get_columns("rule_configs")}
    except Exception:
        return

    dialect = db.bind.dialect.name if db.bind is not None else ""
    column_sql = {
        "category": "VARCHAR(50) DEFAULT 'general'",
        "severity": "VARCHAR(20) DEFAULT 'medium'",
        "created_at": "DATETIME",
    }
    if dialect == "postgresql":
        column_sql["category"] = "VARCHAR(50) DEFAULT 'general'"
        column_sql["severity"] = "VARCHAR(20) DEFAULT 'medium'"
        column_sql["created_at"] = "TIMESTAMP WITH TIME ZONE"

    changed = False
    for column_name, definition in column_sql.items():
        if column_name in existing:
            continue
        db.execute(text(f"ALTER TABLE rule_configs ADD COLUMN {column_name} {definition}"))
        changed = True
    if changed:
        db.commit()


def ensure_default_rules(db: Session) -> None:
    ensure_rule_config_schema(db)
    defaults_by_key = {item["rule_key"]: item for item in DEFAULT_RULES}
    existing = {rule.rule_key: rule for rule in db.query(RuleConfig).all()}

    changed = False
    for rule_key, rule_data in defaults_by_key.items():
        rule = existing.get(rule_key)
        if rule is None:
            db.add(RuleConfig(**rule_data))
            changed = True
            continue
        for field in ("category", "severity", "description"):
            if not getattr(rule, field, None):
                setattr(rule, field, rule_data[field])
                changed = True
        if not getattr(rule, "rule_name", None):
            rule.rule_name = rule_data["rule_name"]
            changed = True
    if changed:
        db.commit()


class RuleEngine:
    """Rule execution service with explainable per-rule scoring."""

    def __init__(self, db: Session):
        self.db = db
        ensure_default_rules(db)
        self.rules = self.load_rules()
        self.brand_keywords = self.load_brand_keywords()
        self.risk_keywords = self.load_risk_keywords()
        self.brand_domain_map = DEFAULT_BRAND_DOMAIN_MAP

    def load_rules(self) -> list[RuleConfig]:
        return db_order_rules(self.db.query(RuleConfig).all())

    def load_brand_keywords(self) -> list[str]:
        keywords = self.db.query(BrandKeyword.keyword).all()
        values = [keyword[0] for keyword in keywords if keyword[0]]
        return values or list(DEFAULT_BRAND_DOMAIN_MAP.keys())

    def load_risk_keywords(self) -> list[str]:
        keywords = self.db.query(RiskKeyword.keyword).all()
        values = [keyword[0] for keyword in keywords if keyword[0]]
        return sorted(set(values + STATIC_RISK_KEYWORDS), key=str.lower)

    def _result(
        self,
        rule: RuleConfig,
        matched: bool,
        reason: str,
        raw_feature: Any,
        observed_value: float,
    ) -> dict[str, Any]:
        enabled = bool(rule.enabled)
        contribution = float(rule.weight or 0) if matched and enabled else 0.0
        if not enabled:
            reason = f"{reason}；规则已停用，本次不计分"
        return {
            "id": rule.id,
            "rule_key": rule.rule_key,
            "rule_name": rule.rule_name,
            "name": rule.rule_name,
            "description": rule.description,
            "category": rule.category or "general",
            "severity": rule.severity or "medium",
            "enabled": enabled,
            "matched": matched,
            "applied": matched and enabled,
            "weight": float(rule.weight or 0),
            "threshold": float(rule.threshold or 0),
            "raw_score": 1.0 if matched else 0.0,
            "weighted_score": contribution,
            "contribution": contribution,
            "reason": reason,
            "detail": reason,
            "raw_feature": raw_feature,
            "observed_value": observed_value,
        }

    def check_url_length(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        url = context["url"]
        threshold = float(rule.threshold or 200)
        length = len(url)
        matched = length > threshold
        reason = f"URL 长度为 {length}，超过阈值 {threshold:g}" if matched else f"URL 长度为 {length}，未超过阈值 {threshold:g}"
        return self._result(rule, matched, reason, {"url": url, "length": length}, length)

    def check_ip_direct(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        url = context["url"]
        matches = re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", url)
        min_hits = _min_count(rule.threshold)
        matched = len(matches) >= min_hits
        reason = f"URL 中出现 IP 地址 {', '.join(matches)}，达到阈值 {min_hits}" if matched else f"URL 中未发现足够 IP 地址，当前 {len(matches)}，阈值 {min_hits}"
        return self._result(rule, matched, reason, {"url": url, "matched_ips": matches}, len(matches))

    def check_suspicious_subdomain(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        domain = context["domain"]
        suspicious = ["login", "secure", "account", "verify", "signin", "auth", "support", "update"]
        parts = [part.lower() for part in domain.split(".")]
        hits = [part for part in parts[:-2] if part in suspicious]
        min_hits = _min_count(rule.threshold)
        matched = len(hits) >= min_hits
        reason = f"子域名包含高风险词 {', '.join(hits)}，达到阈值 {min_hits}" if matched else f"子域名高风险词命中 {len(hits)}，阈值 {min_hits}"
        return self._result(rule, matched, reason, {"domain": domain, "matched_subdomains": hits}, len(hits))

    def check_risky_path(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        url = context["url"].lower()
        words = ["phish", "login", "verify", "account", "secure", "signin", "update", "wallet", "payment"]
        hits = [word for word in words if word in url]
        min_hits = _min_count(rule.threshold)
        matched = len(hits) >= min_hits
        reason = f"URL 路径或参数包含高风险词 {', '.join(hits)}，达到阈值 {min_hits}" if matched else f"URL 高风险路径词命中 {len(hits)}，阈值 {min_hits}"
        return self._result(rule, matched, reason, {"url": context["url"], "matched_keywords": hits}, len(hits))

    def check_password_field(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        has_password_input = bool(context["has_password_input"])
        matched = has_password_input and _min_count(rule.threshold) <= 1
        reason = "页面检测到密码输入框" if matched else "页面未检测到密码输入框，或阈值要求超过 1 个密码框"
        return self._result(rule, matched, reason, {"has_password_input": has_password_input}, 1.0 if has_password_input else 0.0)

    def check_cross_domain_form(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        domain = context["domain"]
        action_domains = context["form_action_domains"]
        cross_domain = [item for item in action_domains if item and not _contains_base_domain(domain, item)]
        min_hits = _min_count(rule.threshold)
        matched = len(cross_domain) >= min_hits
        reason = f"表单提交域 {', '.join(cross_domain)} 与当前域 {domain} 不一致，达到阈值 {min_hits}" if matched else f"跨域表单提交命中 {len(cross_domain)}，阈值 {min_hits}"
        return self._result(rule, matched, reason, {"domain": domain, "form_action_domains": action_domains, "cross_domain_actions": cross_domain}, len(cross_domain))

    def check_risky_keywords(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        text_value = context["all_text"].lower()
        hits = [keyword for keyword in self.risk_keywords if keyword and keyword.lower() in text_value]
        hits = _compact_list(dict.fromkeys(hits), limit=10)
        min_hits = _min_count(rule.threshold)
        matched = len(hits) >= min_hits
        reason = f"页面文本、按钮或输入标签包含高风险词 {', '.join(hits)}，达到阈值 {min_hits}" if matched else f"页面高风险词命中 {len(hits)}，阈值 {min_hits}"
        return self._result(rule, matched, reason, {"matched_keywords": hits, "text_length": len(context["all_text"])}, len(hits))

    def check_brand_impersonation(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        text_value = context["all_text"].lower()
        domain = context["domain"].lower()
        hits: list[str] = []

        for brand, official_markers in self.brand_domain_map.items():
            if brand.lower() in text_value and not any(marker.lower() in domain for marker in official_markers):
                hits.append(brand)

        for keyword in self.brand_keywords:
            lower = keyword.lower()
            if lower in text_value and lower not in domain and keyword not in hits:
                hits.append(keyword)

        hits = _compact_list(dict.fromkeys(hits), limit=10)
        min_hits = _min_count(rule.threshold)
        matched = len(hits) >= min_hits
        reason = f"页面提到品牌 {', '.join(hits)}，但域名 {domain} 未体现对应官方域名关键词" if matched else f"品牌冒充特征命中 {len(hits)}，阈值 {min_hits}"
        return self._result(rule, matched, reason, {"domain": context["domain"], "matched_brands": hits}, len(hits))

    def check_title_domain_mismatch(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        title = context["title"]
        domain = context["domain"]
        threshold = float(rule.threshold or 0.3)
        if not title or not domain:
            return self._result(rule, False, "标题或域名为空，无法判断匹配度", {"title": title, "domain": domain}, 1.0)

        title_words = set(re.findall(r"[a-zA-Z0-9\u4e00-\u9fff]+", title.lower()))
        domain_words = set(re.findall(r"[a-zA-Z0-9]+", domain.lower()))
        stop_words = {"the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with", "www", "com", "cn", "net", "org"}
        title_words = title_words - stop_words
        domain_words = domain_words - stop_words
        if not title_words:
            return self._result(rule, False, "标题中没有可用于匹配的关键词", {"title": title, "domain": domain}, 1.0)

        matched_words = sorted(title_words & domain_words)
        match_ratio = len(matched_words) / max(len(title_words), 1)
        matched = match_ratio < threshold
        reason = f"标题与域名关键词匹配度 {match_ratio:.2f}，低于阈值 {threshold:g}" if matched else f"标题与域名关键词匹配度 {match_ratio:.2f}，达到阈值 {threshold:g}"
        return self._result(rule, matched, reason, {"title": title, "domain": domain, "matched_words": matched_words}, match_ratio)

    def check_suspicious_redirect(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        words = ["redirect", "jump", "loading", "重定向", "跳转", "即将前往", "正在跳转", "倒计时"]
        text_value = context["all_text"].lower()
        hits = [word for word in words if word.lower() in text_value]
        min_hits = _min_count(rule.threshold)
        matched = len(hits) >= min_hits
        reason = f"页面包含可疑跳转提示 {', '.join(hits)}，达到阈值 {min_hits}" if matched else f"可疑跳转提示命中 {len(hits)}，阈值 {min_hits}"
        return self._result(rule, matched, reason, {"matched_keywords": hits}, len(hits))

    def execute_rules(self, features: Dict[str, Any]) -> Dict[str, Any]:
        raw_features = features.get("raw_features", {}) or {}
        context = {
            "url": raw_features.get("url") or "",
            "domain": features.get("domain") or raw_features.get("domain") or "",
            "title": raw_features.get("title") or "",
            "visible_text": raw_features.get("visible_text") or "",
            "button_texts": _compact_list(raw_features.get("button_texts") or [], limit=50),
            "input_labels": _compact_list(raw_features.get("input_labels") or [], limit=50),
            "form_action_domains": _compact_list(raw_features.get("form_action_domains") or [], limit=50),
            "has_password_input": bool(features.get("has_password_input", raw_features.get("has_password_input", False))),
        }
        context["all_text"] = " ".join(
            [
                context["title"],
                context["visible_text"],
                " ".join(context["button_texts"]),
                " ".join(context["input_labels"]),
            ]
        )

        checkers: dict[str, Callable[[RuleConfig, dict[str, Any]], dict[str, Any]]] = {
            "url_length": self.check_url_length,
            "ip_direct": self.check_ip_direct,
            "suspicious_subdomain": self.check_suspicious_subdomain,
            "risky_path": self.check_risky_path,
            "password_field": self.check_password_field,
            "cross_domain_form": self.check_cross_domain_form,
            "risky_keywords": self.check_risky_keywords,
            "brand_impersonation": self.check_brand_impersonation,
            "title_domain_mismatch": self.check_title_domain_mismatch,
            "suspicious_redirect": self.check_suspicious_redirect,
        }

        rule_details: list[dict[str, Any]] = []
        for rule in self.rules:
            checker = checkers.get(rule.rule_key)
            if checker is None:
                rule_details.append(
                    self._result(rule, False, "规则配置存在，但后端尚未实现对应执行逻辑", {"rule_key": rule.rule_key}, 0.0)
                )
                continue
            rule_details.append(checker(rule, context))

        rule_score_total = sum(item["contribution"] for item in rule_details)
        enabled_weight_total = sum(float(rule.weight or 0) for rule in self.rules if rule.enabled)
        rule_score_percent = (rule_score_total / enabled_weight_total * 100) if enabled_weight_total > 0 else 0.0

        return {
            "rule_score": min(100.0, max(0.0, rule_score_percent)),
            "rule_score_total": rule_score_total,
            "enabled_weight_total": enabled_weight_total,
            "hit_rules": rule_details,
            "rules": rule_details,
            "raw_feature_summary": build_raw_feature_summary(context),
        }


def build_raw_feature_summary(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "url": context.get("url") or "",
        "domain": context.get("domain") or "",
        "title": context.get("title") or "",
        "has_password_input": bool(context.get("has_password_input")),
        "form_action_domains": context.get("form_action_domains") or [],
        "button_texts": context.get("button_texts") or [],
        "input_labels": context.get("input_labels") or [],
        "visible_text_length": len(context.get("visible_text") or ""),
        "text_length": len(context.get("all_text") or ""),
    }


def build_model_breakdown(model_probs: dict[str, float], model_score: float | None = None) -> dict[str, Any]:
    safe_prob = float(model_probs.get("safe_prob", model_probs.get("safe", 0.0)) or 0.0)
    suspicious_prob = float(model_probs.get("suspicious_prob", model_probs.get("suspicious", 0.0)) or 0.0)
    malicious_prob = float(model_probs.get("malicious_prob", model_probs.get("malicious", 0.0)) or 0.0)
    dominant_label = max(
        {"safe": safe_prob, "suspicious": suspicious_prob, "malicious": malicious_prob}.items(),
        key=lambda item: item[1],
    )[0]
    if model_score is None:
        model_score = (malicious_prob * 100) + (suspicious_prob * 50)
    return {
        "safe_prob": safe_prob,
        "suspicious_prob": suspicious_prob,
        "malicious_prob": malicious_prob,
        "dominant_label": dominant_label,
        "model_score": model_score,
        "contribution": model_score * 0.6,
        "contribution_summary": f"模型倾向为 {dominant_label}，映射风险分 {model_score:.1f}，在最终融合中按 60% 计入。",
    }


def build_score_breakdown(
    *,
    rules: list[dict[str, Any]],
    rule_score: float,
    rule_score_total: float,
    enabled_weight_total: float,
    model_result: dict[str, float],
    model_score: float,
    final_score: float,
    label: str,
    raw_feature_summary: Optional[dict[str, Any]] = None,
    fusion_summary: Optional[str] = None,
) -> dict[str, Any]:
    model = build_model_breakdown(model_result, model_score)
    return {
        "rule_score_total": rule_score,
        "rule_score_raw_total": rule_score_total,
        "enabled_rule_weight_total": enabled_weight_total,
        "model_score_total": model_score,
        "final_score": final_score,
        "label": label,
        "fusion_summary": fusion_summary
        or f"最终风险分 = 规则分 {rule_score:.1f} x 40% + 模型风险分 {model_score:.1f} x 60%。",
        "rules": rules,
        "model": model,
        "raw_features": raw_feature_summary or {},
    }


def db_order_rules(rules: list[RuleConfig]) -> list[RuleConfig]:
    order = {item["rule_key"]: index for index, item in enumerate(DEFAULT_RULES)}
    return sorted(rules, key=lambda item: (order.get(item.rule_key, 999), item.rule_key))


def build_rule_stats(db: Session, days: int = 7) -> list[dict[str, Any]]:
    ensure_default_rules(db)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    records = db.query(ScanRecord).filter(ScanRecord.created_at >= since).all()
    false_positive_actions = db.query(ReportAction).filter(
        ReportAction.created_at >= since,
        ReportAction.action_type.in_(["mark_false_positive", "false_positive"]),
    ).all()
    false_positive_report_ids = {action.report_id for action in false_positive_actions}
    total_records = max(len(records), 1)

    stats: dict[str, dict[str, Any]] = {
        rule.rule_key: {
            "rule_id": rule.id,
            "rule_key": rule.rule_key,
            "recent_hits_7d": 0,
            "recent_hit_rate_7d": 0.0,
            "risk_hits_7d": 0,
            "suspicious_hits_7d": 0,
            "malicious_hits_7d": 0,
            "false_positive_feedback_7d": 0,
            "last_hit_at": None,
            "false_positive_tendency": "暂无明显误报信号",
        }
        for rule in db_order_rules(db.query(RuleConfig).all())
    }

    for record in records:
        rules = record.hit_rules_json or []
        matched_keys = {
            item.get("rule_key")
            for item in rules
            if item.get("matched") and item.get("rule_key")
        }
        for rule_key in matched_keys:
            if rule_key not in stats:
                stats[rule_key] = {
                    "rule_id": None,
                    "rule_key": rule_key,
                    "recent_hits_7d": 0,
                    "recent_hit_rate_7d": 0.0,
                    "risk_hits_7d": 0,
                    "suspicious_hits_7d": 0,
                    "malicious_hits_7d": 0,
                    "false_positive_feedback_7d": 0,
                    "last_hit_at": None,
                    "false_positive_tendency": "暂无明显误报信号",
                }
            item = stats[rule_key]
            item["recent_hits_7d"] += 1
            if record.label in ("suspicious", "malicious"):
                item["risk_hits_7d"] += 1
            if record.label == "suspicious":
                item["suspicious_hits_7d"] += 1
            if record.label == "malicious":
                item["malicious_hits_7d"] += 1
            if record.id in false_positive_report_ids:
                item["false_positive_feedback_7d"] += 1
            if item["last_hit_at"] is None or record.created_at > item["last_hit_at"]:
                item["last_hit_at"] = record.created_at

    for item in stats.values():
        item["recent_hit_rate_7d"] = item["recent_hits_7d"] / total_records
        fp_count = item["false_positive_feedback_7d"]
        hit_count = item["recent_hits_7d"]
        if fp_count >= 3 or (hit_count >= 3 and fp_count / max(hit_count, 1) >= 0.4):
            item["false_positive_tendency"] = "误报倾向偏高，建议复核阈值或权重"
        elif fp_count > 0:
            item["false_positive_tendency"] = "存在误报反馈，建议观察"
        elif item["suspicious_hits_7d"] > item["malicious_hits_7d"] and item["suspicious_hits_7d"] >= 3:
            item["false_positive_tendency"] = "可疑样本命中较多，建议抽样复核"

    return list(stats.values())
