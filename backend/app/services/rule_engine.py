from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional
from urllib.parse import parse_qsl, unquote, urlparse

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..models import BrandKeyword, ReportAction, RiskKeyword, RuleConfig, ScanRecord
from .rule_dsl import RuleDslEvaluator


DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "rule_key": "url_length",
        "rule_name": "URL complexity signal",
        "description": "Detects unusually long or complex URLs, redirect parameters, nested URLs, and obfuscated tokens.",
        "category": "url",
        "severity": "low",
        "weight": 8.0,
        "threshold": 120.0,
        "enabled": True,
    },
    {
        "rule_key": "ip_direct",
        "rule_name": "Direct IP host",
        "description": "Detects URLs that use an IPv4 address instead of a domain name.",
        "category": "url",
        "severity": "high",
        "weight": 14.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "suspicious_subdomain",
        "rule_name": "Sensitive subdomain wording",
        "description": "Detects sensitive words such as login, secure, verify, or account in subdomains.",
        "category": "domain",
        "severity": "low",
        "weight": 8.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "risky_path",
        "rule_name": "Sensitive path wording",
        "description": "Detects login, verification, payment, banking, wallet, and recovery words in URL paths.",
        "category": "url",
        "severity": "medium",
        "weight": 12.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "password_field",
        "rule_name": "Password input present",
        "description": "Detects whether the page can collect user credentials through a password input.",
        "category": "page",
        "severity": "low",
        "weight": 7.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "cross_domain_form",
        "rule_name": "Cross-domain form submission",
        "description": "Detects form submissions to unknown third-party domains while allowing same-site and trusted providers.",
        "category": "form",
        "severity": "medium",
        "weight": 12.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "risky_keywords",
        "rule_name": "Risky persuasion wording",
        "description": "Detects sensitive objects, urgency, reward, and action wording as grouped persuasion signals.",
        "category": "content",
        "severity": "medium",
        "weight": 12.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "brand_impersonation",
        "rule_name": "Possible brand impersonation",
        "description": "Detects brand wording on domains that do not match official brand markers, especially with login or payment context.",
        "category": "content",
        "severity": "high",
        "weight": 14.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "title_domain_mismatch",
        "rule_name": "Low title-domain similarity",
        "description": "Detects low similarity between title words and domain words as a weak supporting signal.",
        "category": "content",
        "severity": "low",
        "weight": 5.0,
        "threshold": 0.3,
        "enabled": True,
    },
    {
        "rule_key": "suspicious_redirect",
        "rule_name": "Redirect or countdown signal",
        "description": "Detects redirect, countdown, loading, and external redirect parameter signals.",
        "category": "behavior",
        "severity": "low",
        "weight": 6.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "credential_exfiltration_combo",
        "rule_name": "Credential exfiltration combination",
        "description": "Combines password collection with unknown cross-domain forms, direct IP hosts, or non-HTTPS pages.",
        "category": "combo",
        "severity": "high",
        "weight": 18.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "brand_login_mismatch_combo",
        "rule_name": "Brand login mismatch combination",
        "description": "Combines brand wording, credential or verification context, and a non-official domain.",
        "category": "combo",
        "severity": "high",
        "weight": 18.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "ip_sensitive_input_combo",
        "rule_name": "Direct IP with sensitive input combination",
        "description": "Combines direct IP access with password, verification, payment, bank, or wallet signals.",
        "category": "combo",
        "severity": "high",
        "weight": 16.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "payment_urgency_combo",
        "rule_name": "Payment urgency combination",
        "description": "Combines payment, bank card, or verification-code wording with urgent action pressure.",
        "category": "combo",
        "severity": "high",
        "weight": 16.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "wallet_secret_combo",
        "rule_name": "Wallet secret phrase combination",
        "description": "Detects wallet pages that ask for private keys, seed phrases, or mnemonic phrases.",
        "category": "combo",
        "severity": "critical",
        "weight": 20.0,
        "threshold": 1.0,
        "enabled": True,
    },
    {
        "rule_key": "suspicious_redirect_combo",
        "rule_name": "Suspicious redirect combination",
        "description": "Combines external redirect parameters with sensitive input, persuasion, payment, or login context.",
        "category": "combo",
        "severity": "medium",
        "weight": 12.0,
        "threshold": 1.0,
        "enabled": True,
    },
]


DEFAULT_RULE_VERSION = "v2-behavior-risk-scoring"


DEFAULT_BRAND_DOMAIN_MAP: dict[str, list[str]] = {
    "google": ["google.com", "gmail.com", "youtube.com"],
    "github": ["github.com"],
    "microsoft": ["microsoft.com", "live.com", "office.com"],
    "paypal": ["paypal.com"],
    "apple": ["apple.com", "icloud.com"],
    "amazon": ["amazon.com"],
    "alipay": ["alipay.com"],
    "wechat": ["wechat.com", "weixin.qq.com"],
    "weixin": ["wechat.com", "weixin.qq.com"],
    "baidu": ["baidu.com"],
    "tencent": ["tencent.com", "qq.com", "wechat.com"],
    "taobao": ["taobao.com", "tmall.com"],
    "jd": ["jd.com"],
    "支付宝": ["alipay.com"],
    "微信": ["wechat.com", "weixin.qq.com"],
    "百度": ["baidu.com"],
    "腾讯": ["tencent.com", "qq.com", "wechat.com"],
    "淘宝": ["taobao.com", "tmall.com"],
    "京东": ["jd.com"],
    "阿里巴巴": ["alibaba.com", "taobao.com", "tmall.com", "alipay.com"],
}


TRUSTED_FORM_DOMAINS = {
    "google.com",
    "microsoft.com",
    "apple.com",
    "paypal.com",
    "alipay.com",
    "qq.com",
    "wechat.com",
    "weixin.qq.com",
    "stripe.com",
}


REDIRECT_PARAM_NAMES = {
    "redirect",
    "redirect_uri",
    "redirect_url",
    "return",
    "return_url",
    "returnurl",
    "callback",
    "continue",
    "next",
    "target",
    "url",
}


PATH_WORD_GROUPS = {
    "low": ["login", "signin", "account", "auth", "user", "登录", "账号"],
    "medium": ["verify", "verification", "security", "update", "reset", "recover", "unlock", "验证", "解锁", "恢复"],
    "high": ["payment", "pay", "wallet", "bank", "card", "transfer", "withdraw", "kyc", "支付", "银行卡", "转账", "钱包"],
}


KEYWORD_GROUPS = {
    "sensitive": [
        "账号",
        "账户",
        "密码",
        "验证码",
        "银行卡",
        "身份证",
        "钱包",
        "私钥",
        "助记词",
        "account",
        "password",
        "verification code",
        "bank card",
        "wallet",
        "private key",
        "seed phrase",
        "mnemonic",
    ],
    "urgency": [
        "立即",
        "马上",
        "限时",
        "过期",
        "冻结",
        "停用",
        "异常",
        "风险",
        "封禁",
        "urgent",
        "immediately",
        "expired",
        "frozen",
        "suspended",
        "abnormal",
        "risk",
    ],
    "reward": [
        "中奖",
        "领取",
        "红包",
        "返现",
        "补贴",
        "免费",
        "福利",
        "reward",
        "bonus",
        "cashback",
        "free",
        "subsidy",
        "prize",
    ],
    "action": [
        "点击",
        "验证",
        "绑定",
        "输入",
        "提交",
        "授权",
        "解锁",
        "恢复",
        "登录",
        "重新登录",
        "click",
        "verify",
        "bind",
        "submit",
        "authorize",
        "unlock",
        "recover",
        "login",
        "sign in",
    ],
}


PAYMENT_CONTEXT_TERMS = {
    "支付",
    "付款",
    "转账",
    "银行卡",
    "验证码",
    "payment",
    "pay",
    "card",
    "bank",
    "transfer",
    "verification code",
}


STATIC_RISK_KEYWORDS = sorted({word for values in KEYWORD_GROUPS.values() for word in values}, key=str.lower)


def _min_count(threshold: Optional[float]) -> int:
    if threshold is None or threshold <= 0:
        return 1
    return max(1, int(threshold))


def _compact_list(items: Iterable[Any], limit: int = 6) -> list[str]:
    values = [str(item).strip() for item in items if str(item).strip()]
    return values[:limit]


def _host_without_www(host: str) -> str:
    return host.lower().strip(".").removeprefix("www.")


def _registered_domain(host: str) -> str:
    host = _host_without_www(host)
    parts = [part for part in host.split(".") if part]
    if len(parts) <= 2:
        return host
    return ".".join(parts[-2:])


def _host_matches_domain(host: str, base_domain: str) -> bool:
    host = _host_without_www(host)
    base_domain = _host_without_www(base_domain)
    return host == base_domain or host.endswith("." + base_domain)


def _contains_base_domain(domain: str, action_domain: str) -> bool:
    current = _host_without_www(domain)
    target = _host_without_www(action_domain)
    return target == current or target.endswith("." + current) or _registered_domain(target) == _registered_domain(current)


def _is_ipv4_host(host: str) -> bool:
    return bool(re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", host))


def _looks_like_obfuscated_token(value: str) -> bool:
    cleaned = re.sub(r"[^A-Za-z0-9_=-]", "", value)
    if len(cleaned) < 32:
        return False
    has_upper = any(char.isupper() for char in cleaned)
    has_lower = any(char.islower() for char in cleaned)
    has_digit = any(char.isdigit() for char in cleaned)
    base64ish = bool(re.fullmatch(r"[A-Za-z0-9+/=_-]{32,}", cleaned))
    return base64ish and sum([has_upper, has_lower, has_digit]) >= 2


def _contains_term(text: str, term: str) -> bool:
    normalized_text = text.lower()
    normalized_term = term.lower()
    if re.fullmatch(r"[a-z0-9 ]+", normalized_term):
        pattern = r"(?<![a-z0-9])" + re.escape(normalized_term) + r"(?![a-z0-9])"
        return bool(re.search(pattern, normalized_text))
    return normalized_term in normalized_text


def _matched_terms(text: str, terms: Iterable[str]) -> list[str]:
    return _compact_list(dict.fromkeys(term for term in terms if _contains_term(text, term)), limit=12)


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
            db.add(
                RuleConfig(
                    **rule_data,
                    type="heuristic",
                    scope="global",
                    version=DEFAULT_RULE_VERSION,
                )
            )
            changed = True
            continue

        can_upgrade_default = (
            getattr(rule, "type", None) in (None, "", "heuristic")
            and getattr(rule, "scope", None) in (None, "", "global")
            and getattr(rule, "version", None) in (None, "", "v1", DEFAULT_RULE_VERSION)
        )
        if not can_upgrade_default:
            continue

        for field in ("rule_name", "description", "category", "severity", "weight", "threshold"):
            if getattr(rule, field, None) != rule_data[field]:
                setattr(rule, field, rule_data[field])
                changed = True
        if getattr(rule, "version", None) != DEFAULT_RULE_VERSION:
            rule.version = DEFAULT_RULE_VERSION
            changed = True
    if changed:
        db.commit()


class RuleEngine:
    """Rule execution service with explainable behavior-signal scoring."""

    def __init__(self, db: Session):
        self.db = db
        ensure_default_rules(db)
        self.rules = self.load_rules()
        self.brand_keywords = self.load_brand_keywords()
        self.risk_keywords = self.load_risk_keywords()
        self.brand_domain_map = DEFAULT_BRAND_DOMAIN_MAP
        self.trusted_form_domains = TRUSTED_FORM_DOMAINS

    def load_rules(self) -> list[RuleConfig]:
        return db_order_rules(self.db.query(RuleConfig).all())

    def load_brand_keywords(self) -> list[str]:
        keywords = self.db.query(BrandKeyword.keyword).all()
        values = [keyword[0] for keyword in keywords if keyword[0]]
        return sorted(set(values or list(DEFAULT_BRAND_DOMAIN_MAP.keys())), key=str.lower)

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
        *,
        raw_score: float | None = None,
        evidence: dict[str, Any] | None = None,
        caution: bool = False,
        false_positive_note: str | None = None,
        severity: str | None = None,
    ) -> dict[str, Any]:
        enabled = bool(rule.enabled)
        normalized_raw_score = max(0.0, min(1.0, float(raw_score if raw_score is not None else (1.0 if matched else 0.0))))
        contribution = float(rule.weight or 0) * normalized_raw_score if matched and enabled else 0.0
        if not enabled:
            reason = f"{reason}; rule is disabled and does not contribute to this score"
        if evidence is not None:
            normalized_evidence = evidence
        elif isinstance(raw_feature, dict):
            normalized_evidence = raw_feature
        else:
            normalized_evidence = {"value": raw_feature}
        return {
            "id": rule.id,
            "rule_key": rule.rule_key,
            "rule_name": rule.rule_name,
            "name": rule.rule_name,
            "description": rule.description,
            "category": rule.category or "general",
            "severity": severity or rule.severity or "medium",
            "enabled": enabled,
            "matched": matched,
            "applied": matched and enabled,
            "weight": float(rule.weight or 0),
            "threshold": float(rule.threshold or 0),
            "raw_score": normalized_raw_score if matched else 0.0,
            "weighted_score": contribution,
            "contribution": contribution,
            "reason": reason,
            "detail": reason,
            "raw_feature": raw_feature,
            "observed_value": observed_value,
            "evidence": normalized_evidence,
            "caution": caution,
            "false_positive_note": false_positive_note,
        }

    def _url_features(self, context: dict[str, Any]) -> dict[str, Any]:
        url = context["url"]
        parsed = urlparse(url)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        redirect_params: list[dict[str, str]] = []
        nested_urls: list[dict[str, str]] = []
        obfuscated_values: list[str] = []

        for key, value in query_pairs:
            key_lower = key.lower()
            decoded_value = unquote(value or "")
            if key_lower in REDIRECT_PARAM_NAMES:
                redirect_params.append({"name": key, "value": decoded_value[:160]})
            if "http://" in decoded_value.lower() or "https://" in decoded_value.lower():
                nested_urls.append({"name": key, "value": decoded_value[:160]})
            if _looks_like_obfuscated_token(decoded_value):
                obfuscated_values.append(key)

        path_segments = [segment for segment in re.split(r"[/._\-]+", unquote(parsed.path.lower())) if segment]
        return {
            "scheme": parsed.scheme.lower(),
            "host": _host_without_www(parsed.hostname or context.get("domain") or ""),
            "path": unquote(parsed.path.lower()),
            "path_segments": path_segments,
            "query_pairs": query_pairs,
            "param_count": len(query_pairs),
            "redirect_params": redirect_params,
            "nested_urls": nested_urls,
            "obfuscated_values": obfuscated_values,
            "length": len(url),
        }

    def _keyword_groups(self, context: dict[str, Any]) -> dict[str, list[str]]:
        text_value = context["all_text"].lower()
        grouped: dict[str, list[str]] = {}
        for group, words in KEYWORD_GROUPS.items():
            grouped[group] = _compact_list(dict.fromkeys(word for word in words if word.lower() in text_value), limit=12)
        return grouped

    def _path_hits(self, context: dict[str, Any]) -> dict[str, list[str]]:
        url_features = context["url_features"]
        searchable = " ".join([url_features["path"], urlparse(context["url"]).query]).lower()
        return {
            group: _compact_list(dict.fromkeys(word for word in words if word.lower() in searchable), limit=12)
            for group, words in PATH_WORD_GROUPS.items()
        }

    def _form_classification(self, context: dict[str, Any]) -> dict[str, list[str]]:
        domain = context["domain"]
        actions = [_host_without_www(item) for item in context["form_action_domains"] if item]
        same_site: list[str] = []
        trusted: list[str] = []
        unknown: list[str] = []
        for action_domain in actions:
            if _contains_base_domain(domain, action_domain):
                same_site.append(action_domain)
            elif any(_host_matches_domain(action_domain, trusted_domain) for trusted_domain in self.trusted_form_domains):
                trusted.append(action_domain)
            else:
                unknown.append(action_domain)
        return {
            "same_site": sorted(set(same_site)),
            "trusted_third_party": sorted(set(trusted)),
            "unknown_cross_domain": sorted(set(unknown)),
        }

    def _brand_context(self, context: dict[str, Any]) -> dict[str, Any]:
        text_value = context["all_text"].lower()
        domain = _host_without_www(context["domain"])
        registered = _registered_domain(domain)
        mismatched: list[str] = []
        official: list[str] = []
        mentioned: list[str] = []

        for brand, official_domains in self.brand_domain_map.items():
            if brand.lower() not in text_value:
                continue
            mentioned.append(brand)
            if any(_host_matches_domain(domain, official_domain) or registered == official_domain for official_domain in official_domains):
                official.append(brand)
            else:
                mismatched.append(brand)

        for keyword in self.brand_keywords:
            lower = keyword.lower()
            if lower in text_value and keyword not in mentioned:
                mentioned.append(keyword)
                if lower in registered:
                    official.append(keyword)
                else:
                    mismatched.append(keyword)

        return {
            "mentioned": _compact_list(dict.fromkeys(mentioned), limit=12),
            "official": _compact_list(dict.fromkeys(official), limit=12),
            "mismatched": _compact_list(dict.fromkeys(mismatched), limit=12),
        }

    def _context_flags(self, context: dict[str, Any]) -> dict[str, Any]:
        keywords = context["keyword_groups"]
        path_hits = context["path_hits"]
        all_path_hits = {hit for hits in path_hits.values() for hit in hits}
        all_keyword_hits = {hit for hits in keywords.values() for hit in hits}
        text = context["all_text"].lower()
        payment_terms = set(_matched_terms(" ".join([text, context["url"]]), PAYMENT_CONTEXT_TERMS))
        return {
            "has_sensitive_input": bool(context["has_password_input"] or keywords["sensitive"]),
            "has_login_context": bool({"login", "signin", "auth", "account", "登录", "账号"} & all_path_hits)
            or any(word in text for word in ["login", "sign in", "登录", "账号"]),
            "has_verification_context": bool({"verify", "verification", "security", "reset", "recover", "unlock", "验证", "解锁", "恢复"} & all_path_hits)
            or any(word in text for word in ["verification", "verify", "验证码", "验证"]),
            "has_payment_context": bool({"payment", "pay", "wallet", "bank", "card", "transfer", "withdraw", "kyc", "支付", "付款", "银行卡", "转账", "钱包"} & all_path_hits)
            or any(word in all_keyword_hits for word in ["银行卡", "验证码", "钱包", "bank card", "verification code", "wallet"])
            or bool(payment_terms),
            "payment_terms": sorted(payment_terms),
            "has_wallet_secret": bool({"wallet", "private key", "seed phrase", "助记词", "私钥", "mnemonic"} & all_keyword_hits),
            "has_urgency": bool(keywords["urgency"]),
            "has_reward": bool(keywords["reward"]),
            "has_action_prompt": bool(keywords["action"]),
            "has_persuasion_combo": sum(bool(keywords[group]) for group in ("sensitive", "urgency", "reward", "action")) >= 2,
        }

    def check_url_length(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        features = context["url_features"]
        length = features["length"]
        param_count = features["param_count"]
        redirect_count = len(features["redirect_params"])
        nested_count = len(features["nested_urls"])
        obfuscated_count = len(features["obfuscated_values"])

        raw_score = 0.0
        length_level = "normal"
        if length > 400:
            raw_score += 0.65
            length_level = "strong"
        elif length > 200:
            raw_score += 0.45
            length_level = "medium"
        elif length >= float(rule.threshold or 120):
            raw_score += 0.25
            length_level = "mild"
        if param_count >= 8:
            raw_score += 0.2
        elif param_count >= 4:
            raw_score += 0.1
        if redirect_count:
            raw_score += 0.2
        if nested_count:
            raw_score += 0.25
        if obfuscated_count:
            raw_score += 0.2

        raw_score = min(1.0, raw_score)
        matched = raw_score > 0
        reason = (
            "URL shows complexity signals: length level=%s, params=%d, redirect params=%d, nested URLs=%d, obfuscated tokens=%d. "
            "Unusual URL complexity may indicate tracking, redirection, or obfuscation, but this signal alone does not prove malicious behavior."
            % (length_level, param_count, redirect_count, nested_count, obfuscated_count)
            if matched
            else "URL complexity is within the low-risk range."
        )
        evidence = {
            "length": length,
            "length_level": length_level,
            "param_count": param_count,
            "redirect_params": features["redirect_params"],
            "nested_urls": features["nested_urls"],
            "obfuscated_param_names": features["obfuscated_values"],
        }
        return self._result(
            rule,
            matched,
            reason,
            evidence,
            length,
            raw_score=raw_score,
            evidence=evidence,
            caution=True,
            false_positive_note="Long or complex URLs are common in analytics, SSO, and campaign links; combine with other signals before treating as high risk.",
        )

    def check_ip_direct(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        host = context["url_features"]["host"]
        matched = _is_ipv4_host(host)
        reason = (
            f"URL uses direct IPv4 host {host}. Direct IP access is sensitive because it bypasses normal domain identity, "
            "but it is not malicious by itself; risk increases with password, payment, verification, or non-HTTPS signals."
            if matched
            else "URL host is not a direct IPv4 address."
        )
        return self._result(
            rule,
            matched,
            reason,
            {"host": host},
            1.0 if matched else 0.0,
            raw_score=0.65 if matched else 0.0,
            evidence={"host": host},
            caution=True,
            false_positive_note="Internal tools and routers may use direct IP hosts; combine with sensitive-input signals before escalation.",
        )

    def check_suspicious_subdomain(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        domain = context["domain"]
        suspicious = ["login", "secure", "account", "verify", "signin", "auth", "support", "update", "security"]
        parts = [part.lower() for part in domain.split(".")]
        hits = [part for part in parts[:-2] if part in suspicious]
        matched = bool(hits)
        raw_score = min(0.6, 0.2 + len(hits) * 0.15) if matched else 0.0
        reason = (
            f"Subdomain contains sensitive wording {', '.join(hits)}. This is a weak identity signal and needs page-context support."
            if matched
            else "Subdomain does not contain sensitive security or login wording."
        )
        return self._result(
            rule,
            matched,
            reason,
            {"domain": domain, "matched_subdomains": hits},
            len(hits),
            raw_score=raw_score,
            evidence={"matched_subdomains": hits},
            caution=True,
            false_positive_note="Legitimate services often use login or account subdomains.",
        )

    def check_risky_path(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        hits = context["path_hits"]
        matched = any(hits.values())
        raw_score = 0.0
        if hits["low"]:
            raw_score += 0.2
        if hits["medium"]:
            raw_score += 0.45
        if hits["high"]:
            raw_score += 0.65
        raw_score = min(1.0, raw_score)
        reason = (
            f"URL path/query includes sensitive wording: low={hits['low']}, medium={hits['medium']}, high={hits['high']}. "
            "Login/account words are low-risk alone; financial or wallet words carry more weight and should be combined with page behavior."
            if matched
            else "URL path/query does not include sensitive login, verification, payment, bank, or wallet wording."
        )
        return self._result(
            rule,
            matched,
            reason,
            {"path_hits": hits},
            sum(len(values) for values in hits.values()),
            raw_score=raw_score,
            evidence={"path_hits": hits},
            caution=True,
            false_positive_note="Normal applications commonly use login, account, payment, or reset paths.",
        )

    def check_password_field(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        has_password_input = bool(context["has_password_input"])
        reason = (
            "Page contains a password input, so it can collect user credentials. This feature itself is not malicious because normal login pages also contain password fields; risk rises when combined with unknown cross-domain submission, brand mismatch, direct IP access, non-HTTPS, or coercive wording."
            if has_password_input
            else "Page does not expose a password input signal."
        )
        return self._result(
            rule,
            has_password_input,
            reason,
            {"has_password_input": has_password_input},
            1.0 if has_password_input else 0.0,
            raw_score=0.35 if has_password_input else 0.0,
            evidence={"has_password_input": has_password_input},
            caution=True,
            false_positive_note="Password fields are expected on legitimate login pages and must not be treated as malicious by themselves.",
        )

    def check_cross_domain_form(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        classification = context["form_classification"]
        unknown = classification["unknown_cross_domain"]
        trusted = classification["trusted_third_party"]
        matched = bool(unknown)
        raw_score = min(1.0, 0.45 + 0.15 * (len(unknown) - 1)) if matched else 0.0
        if trusted and not unknown:
            raw_score = 0.0
        reason = (
            f"Form submits to unknown third-party domain(s): {', '.join(unknown)}. Same-site and trusted auth/payment providers are not scored; unknown destinations become higher risk when credentials, payment, or brand signals are present."
            if matched
            else f"Form actions are same-site or trusted: same_site={classification['same_site']}, trusted={trusted}."
        )
        return self._result(
            rule,
            matched,
            reason,
            classification,
            len(unknown),
            raw_score=raw_score,
            evidence=classification,
            caution=True,
            false_positive_note="Federated login and payment providers can legitimately use third-party domains.",
        )

    def check_risky_keywords(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        grouped = context["keyword_groups"]
        matched_groups = [group for group, hits in grouped.items() if hits]
        matched = bool(matched_groups)
        group_count = len(matched_groups)
        raw_score = 0.0
        if matched:
            raw_score = 0.2 if group_count == 1 else 0.45 if group_count == 2 else 0.75
        if context["flags"]["has_wallet_secret"]:
            raw_score = max(raw_score, 0.85)
        reason = (
            f"Page wording matched grouped persuasion signals: {grouped}. Single sensitive words are low-risk; cross-group combinations such as account abnormal + verify now or bank card + code + submit are stronger risk signals."
            if matched
            else "Page text does not match configured sensitive, urgency, reward, or action wording groups."
        )
        return self._result(
            rule,
            matched,
            reason,
            {"keyword_groups": grouped, "text_length": len(context["all_text"])},
            sum(len(values) for values in grouped.values()),
            raw_score=raw_score,
            evidence={"keyword_groups": grouped, "matched_groups": matched_groups},
            caution=group_count <= 1,
            false_positive_note="Individual words such as account, password, or verification code appear on legitimate pages; grouped persuasion context matters.",
        )

    def check_brand_impersonation(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        brand_context = context["brand_context"]
        mismatched = brand_context["mismatched"]
        flags = context["flags"]
        sensitive_context = (
            context["has_password_input"]
            or flags["has_login_context"]
            or flags["has_verification_context"]
            or flags["has_payment_context"]
            or bool(context["form_action_domains"])
            or flags["has_persuasion_combo"]
        )
        matched = bool(mismatched and sensitive_context)
        raw_score = 0.0
        if mismatched:
            raw_score = 0.25
        if matched:
            raw_score = 0.65
            if context["has_password_input"] or context["form_classification"]["unknown_cross_domain"]:
                raw_score = 0.85
        reason = (
            f"Page mentions brand(s) {mismatched} while the domain is {context['domain']} and the page has login/payment/verification context. Brand wording alone is not enough; this score is raised because identity mismatch appears with sensitive behavior."
            if matched
            else f"Brand mentions were found but did not combine with enough sensitive page behavior, or the domain matched official markers: {brand_context}."
        )
        return self._result(
            rule,
            bool(mismatched),
            reason,
            {"domain": context["domain"], "brand_context": brand_context},
            len(mismatched),
            raw_score=raw_score,
            evidence={"brand_context": brand_context, "sensitive_context": sensitive_context},
            caution=not matched,
            false_positive_note="Brand names can appear in news, help pages, or integrations; risk rises when brand identity is paired with credential, payment, or verification collection on a non-official domain.",
        )

    def check_title_domain_mismatch(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        title = context["title"]
        domain = context["domain"]
        threshold = float(rule.threshold or 0.3)
        if not title or not domain:
            return self._result(
                rule,
                False,
                "Title or domain is empty, so title-domain similarity was not evaluated.",
                {"title": title, "domain": domain},
                1.0,
                raw_score=0.0,
                evidence={"title": title, "domain": domain},
                caution=True,
                false_positive_note="Missing title metadata is common and should not imply risk.",
            )

        title_words = set(re.findall(r"[a-zA-Z0-9\u4e00-\u9fff]+", title.lower()))
        domain_words = set(re.findall(r"[a-zA-Z0-9]+", domain.lower()))
        stop_words = {"the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with", "www", "com", "cn", "net", "org"}
        title_words = title_words - stop_words
        domain_words = domain_words - stop_words
        if not title_words:
            return self._result(
                rule,
                False,
                "Title has no meaningful words for domain comparison.",
                {"title": title, "domain": domain},
                1.0,
                raw_score=0.0,
                evidence={"title": title, "domain": domain},
                caution=True,
                false_positive_note="Generic titles are common and should not imply malicious behavior.",
            )

        matched_words = sorted(title_words & domain_words)
        match_ratio = len(matched_words) / max(len(title_words), 1)
        matched = match_ratio < threshold
        raw_score = min(0.45, (threshold - match_ratio) / max(threshold, 0.01) * 0.45) if matched else 0.0
        reason = (
            f"Title-domain keyword similarity is {match_ratio:.2f}, below threshold {threshold:g}. This is a weak supporting signal only."
            if matched
            else f"Title-domain keyword similarity is {match_ratio:.2f}, which is within the expected range."
        )
        return self._result(
            rule,
            matched,
            reason,
            {"title": title, "domain": domain, "matched_words": matched_words},
            match_ratio,
            raw_score=raw_score,
            evidence={"matched_words": matched_words, "match_ratio": match_ratio},
            caution=True,
            false_positive_note="Titles often contain marketing or third-party brand words; low similarity should remain a weak signal.",
        )

    def check_suspicious_redirect(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        text_value = context["all_text"].lower()
        words = ["redirect", "jump", "loading", "countdown", "重定向", "跳转", "即将前往", "正在跳转", "倒计时", "加载中"]
        hits = [word for word in words if word.lower() in text_value]
        redirect_params = context["url_features"]["redirect_params"]
        nested_urls = context["url_features"]["nested_urls"]
        raw_score = 0.0
        if hits:
            raw_score += 0.25
        if redirect_params:
            raw_score += 0.35
        if nested_urls:
            raw_score += 0.2
        matched = raw_score > 0
        reason = (
            f"Redirect signal detected: text={hits}, redirect_params={redirect_params}, nested_urls={nested_urls}. Ordinary loading or redirect text is low-risk; risk increases with external targets and sensitive context."
            if matched
            else "No redirect, countdown, loading, or redirect-parameter signal was detected."
        )
        return self._result(
            rule,
            matched,
            reason,
            {"matched_keywords": hits, "redirect_params": redirect_params, "nested_urls": nested_urls},
            len(hits) + len(redirect_params) + len(nested_urls),
            raw_score=min(1.0, raw_score),
            evidence={"matched_keywords": hits, "redirect_params": redirect_params, "nested_urls": nested_urls},
            caution=True,
            false_positive_note="Redirect and loading pages are common in legitimate SSO, payment, and navigation flows.",
        )

    def check_credential_exfiltration_combo(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        evidence = {
            "has_password_input": context["has_password_input"],
            "unknown_cross_domain_forms": context["form_classification"]["unknown_cross_domain"],
            "scheme": context["url_features"]["scheme"],
            "direct_ip": _is_ipv4_host(context["url_features"]["host"]),
        }
        triggers = []
        if context["has_password_input"] and evidence["unknown_cross_domain_forms"]:
            triggers.append("password_input_with_unknown_cross_domain_form")
        if context["has_password_input"] and evidence["scheme"] != "https":
            triggers.append("password_input_over_non_https")
        if context["has_password_input"] and evidence["direct_ip"]:
            triggers.append("password_input_on_direct_ip")
        matched = bool(triggers)
        raw_score = min(1.0, 0.6 + 0.2 * (len(triggers) - 1)) if matched else 0.0
        reason = (
            f"Credential collection risk combination detected: {triggers}. Password collection combined with unknown form destinations, direct IP hosts, or non-HTTPS transport significantly raises account-theft risk."
            if matched
            else "Credential exfiltration combination was not detected."
        )
        evidence["triggers"] = triggers
        return self._result(rule, matched, reason, evidence, len(triggers), raw_score=raw_score, evidence=evidence)

    def check_brand_login_mismatch_combo(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        brand_context = context["brand_context"]
        flags = context["flags"]
        sensitive_context = context["has_password_input"] or flags["has_login_context"] or flags["has_verification_context"] or flags["has_payment_context"]
        matched = bool(brand_context["mismatched"] and sensitive_context)
        evidence = {"brand_context": brand_context, "sensitive_context": sensitive_context}
        reason = (
            f"Brand login mismatch detected: brand(s) {brand_context['mismatched']} appear with login, verification, payment, or password context on non-official domain {context['domain']}."
            if matched
            else "Brand login mismatch combination was not detected."
        )
        raw_score = 0.85 if context["has_password_input"] and matched else 0.7 if matched else 0.0
        return self._result(rule, matched, reason, evidence, 1.0 if matched else 0.0, raw_score=raw_score, evidence=evidence)

    def check_ip_sensitive_input_combo(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        direct_ip = _is_ipv4_host(context["url_features"]["host"])
        flags = context["flags"]
        sensitive = context["has_password_input"] or flags["has_verification_context"] or flags["has_payment_context"] or flags["has_wallet_secret"]
        matched = bool(direct_ip and sensitive)
        evidence = {"direct_ip": direct_ip, "host": context["url_features"]["host"], "sensitive": sensitive, "flags": flags}
        reason = (
            "Direct IP host appears with password, verification, payment, bank, or wallet signals. This combination is significantly riskier than direct IP access alone."
            if matched
            else "Direct IP with sensitive input combination was not detected."
        )
        return self._result(rule, matched, reason, evidence, 1.0 if matched else 0.0, raw_score=0.8 if matched else 0.0, evidence=evidence)

    def check_payment_urgency_combo(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        grouped = context["keyword_groups"]
        searchable_text = " ".join([context["all_text"], context["url"]])
        payment_terms = _matched_terms(searchable_text, PAYMENT_CONTEXT_TERMS)
        has_payment = context["flags"]["has_payment_context"] or bool(payment_terms)
        has_pressure = context["flags"]["has_urgency"] or context["flags"]["has_action_prompt"]
        matched = bool(has_payment and has_pressure)
        evidence = {"keyword_groups": grouped, "path_hits": context["path_hits"], "payment_terms": payment_terms}
        reason = (
            "Payment or verification-code wording appears with urgency or submit/action pressure. This pattern is common in payment fraud and account verification scams."
            if matched
            else "Payment urgency combination was not detected."
        )
        return self._result(rule, matched, reason, evidence, 1.0 if matched else 0.0, raw_score=0.75 if matched else 0.0, evidence=evidence)

    def check_wallet_secret_combo(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        grouped = context["keyword_groups"]
        wallet_words = [word for word in grouped["sensitive"] if word in {"钱包", "wallet"}]
        secret_words = [word for word in grouped["sensitive"] if word in {"私钥", "助记词", "private key", "seed phrase", "mnemonic"}]
        matched = bool(wallet_words and secret_words)
        evidence = {"wallet_words": wallet_words, "secret_words": secret_words}
        reason = (
            f"Wallet secret request detected: wallet words={wallet_words}, secret words={secret_words}. Asking for seed phrases, private keys, or mnemonic phrases is a critical wallet-theft signal."
            if matched
            else "Wallet secret phrase combination was not detected."
        )
        return self._result(rule, matched, reason, evidence, 1.0 if matched else 0.0, raw_score=1.0 if matched else 0.0, evidence=evidence)

    def check_suspicious_redirect_combo(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        has_external_redirect = bool(context["url_features"]["redirect_params"] or context["url_features"]["nested_urls"])
        flags = context["flags"]
        sensitive_context = (
            context["has_password_input"]
            or flags["has_persuasion_combo"]
            or flags["has_payment_context"]
            or flags["has_login_context"]
            or flags["has_verification_context"]
        )
        matched = bool(has_external_redirect and sensitive_context)
        evidence = {
            "redirect_params": context["url_features"]["redirect_params"],
            "nested_urls": context["url_features"]["nested_urls"],
            "flags": flags,
            "has_password_input": context["has_password_input"],
        }
        reason = (
            "External redirect parameter appears with sensitive input, persuasion, payment, login, or verification context. This combination is more concerning than a normal redirect page."
            if matched
            else "Suspicious redirect combination was not detected."
        )
        return self._result(rule, matched, reason, evidence, 1.0 if matched else 0.0, raw_score=0.7 if matched else 0.0, evidence=evidence)

    def check_custom_rule(self, rule: RuleConfig, context: dict[str, Any]) -> dict[str, Any]:
        context = self._ensure_context(context)
        dsl_condition = self._extract_dsl_condition(rule.content)
        if dsl_condition is not None:
            dsl_result = RuleDslEvaluator(context).evaluate(dsl_condition)
            return self._result(
                rule,
                bool(dsl_result["matched"]),
                str(dsl_result["reason"]),
                dsl_result["raw_feature"],
                float(dsl_result["observed_value"]),
            )

        pattern = str(rule.pattern or "").strip()
        if pattern:
            dsl_result = RuleDslEvaluator(context).evaluate(
                {
                    "field": "url",
                    "operator": "contains",
                    "value": pattern,
                }
            )
            return self._result(
                rule,
                bool(dsl_result["matched"]),
                f"pattern fallback: {dsl_result['reason']}",
                dsl_result["raw_feature"],
                float(dsl_result["observed_value"]),
            )

        return self._result(
            rule,
            False,
            "Rule config exists, but no checker, valid DSL content, or pattern fallback is available",
            {"rule_key": rule.rule_key, "content": rule.content, "pattern": rule.pattern},
            0.0,
        )

    def _extract_dsl_condition(self, content: Any) -> dict[str, Any] | None:
        if not content:
            return None
        parsed: Any = content
        if isinstance(content, str):
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                return None

        if not isinstance(parsed, dict):
            return None
        if isinstance(parsed.get("condition"), dict):
            parsed = parsed["condition"]
        if self._looks_like_dsl_condition(parsed):
            return parsed
        return None

    def _looks_like_dsl_condition(self, value: Any) -> bool:
        return isinstance(value, dict) and any(key in value for key in ("field", "all", "any", "not"))

    def _ensure_context(self, context: dict[str, Any]) -> dict[str, Any]:
        if "url_features" in context:
            return context
        raw_features = {
            "url": context.get("url") or "",
            "domain": context.get("domain") or "",
            "title": context.get("title") or "",
            "visible_text": context.get("visible_text") or context.get("all_text") or "",
            "button_texts": context.get("button_texts") or [],
            "input_labels": context.get("input_labels") or [],
            "form_action_domains": context.get("form_action_domains") or [],
            "has_password_input": bool(context.get("has_password_input", False)),
        }
        return self._build_context(
            {
                "domain": raw_features["domain"],
                "has_password_input": raw_features["has_password_input"],
                "raw_features": raw_features,
            }
        )

    def _build_context(self, features: dict[str, Any]) -> dict[str, Any]:
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
        context["url_features"] = self._url_features(context)
        context["keyword_groups"] = self._keyword_groups(context)
        context["path_hits"] = self._path_hits(context)
        context["form_classification"] = self._form_classification(context)
        context["brand_context"] = self._brand_context(context)
        context["flags"] = self._context_flags(context)
        return context

    def _checkers(self) -> dict[str, Callable[[RuleConfig, dict[str, Any]], dict[str, Any]]]:
        return {
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
            "credential_exfiltration_combo": self.check_credential_exfiltration_combo,
            "brand_login_mismatch_combo": self.check_brand_login_mismatch_combo,
            "ip_sensitive_input_combo": self.check_ip_sensitive_input_combo,
            "payment_urgency_combo": self.check_payment_urgency_combo,
            "wallet_secret_combo": self.check_wallet_secret_combo,
            "suspicious_redirect_combo": self.check_suspicious_redirect_combo,
        }

    def evaluate_rule(self, rule: RuleConfig, features: dict[str, Any]) -> dict[str, Any]:
        context = self._build_context(features)
        checker = self._checkers().get(rule.rule_key) or self.check_custom_rule
        return checker(rule, context)

    def execute_rules(self, features: dict[str, Any]) -> dict[str, Any]:
        context = self._build_context(features)
        checkers = self._checkers()
        rule_details: list[dict[str, Any]] = []
        for rule in self.rules:
            checker = checkers.get(rule.rule_key) or self.check_custom_rule
            rule_details.append(checker(rule, context))

        rule_score_total = sum(float(item["contribution"] or 0) for item in rule_details)
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
        "url_complexity": {
            "length": context.get("url_features", {}).get("length", 0),
            "param_count": context.get("url_features", {}).get("param_count", 0),
            "redirect_params": context.get("url_features", {}).get("redirect_params", []),
            "nested_urls": context.get("url_features", {}).get("nested_urls", []),
            "obfuscated_values": context.get("url_features", {}).get("obfuscated_values", []),
        },
        "form_classification": context.get("form_classification") or {},
        "keyword_groups": context.get("keyword_groups") or {},
        "brand_context": context.get("brand_context") or {},
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
            "false_positive_tendency": "No clear false-positive signal yet.",
        }
        for rule in db_order_rules(db.query(RuleConfig).all())
    }

    for record in records:
        rules = record.hit_rules_json or []
        matched_keys = {item.get("rule_key") for item in rules if item.get("matched") and item.get("rule_key")}
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
                    "false_positive_tendency": "No clear false-positive signal yet.",
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
            item["false_positive_tendency"] = "False-positive tendency is elevated; review threshold, raw score, or weight."
        elif fp_count > 0:
            item["false_positive_tendency"] = "False-positive feedback exists; monitor before changing behavior."
        elif item["suspicious_hits_7d"] > item["malicious_hits_7d"] and item["suspicious_hits_7d"] >= 3:
            item["false_positive_tendency"] = "Many suspicious hits; sample recent cases before raising severity."

    return list(stats.values())
