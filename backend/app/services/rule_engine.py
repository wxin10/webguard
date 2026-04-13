import re
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..models import RuleConfig, BrandKeyword, RiskKeyword


class RuleEngine:
    """规则引擎服务"""

    def __init__(self, db: Session):
        self.db = db
        self.rules = self.load_rules()
        self.brand_keywords = self.load_brand_keywords()
        self.risk_keywords = self.load_risk_keywords()
        # 品牌词 -> 官方域名关键词映射（预留结构，当前使用简化映射）
        self.brand_domain_map = self.load_brand_domain_map()

    def load_rules(self) -> List[RuleConfig]:
        """加载规则配置"""
        return self.db.query(RuleConfig).filter(RuleConfig.enabled == True).all()

    def load_brand_keywords(self) -> List[str]:
        """加载品牌关键词"""
        keywords = self.db.query(BrandKeyword.keyword).all()
        return [k[0] for k in keywords]

    def load_risk_keywords(self) -> List[str]:
        """加载风险关键词"""
        keywords = self.db.query(RiskKeyword.keyword).all()
        return [k[0] for k in keywords]

    def load_brand_domain_map(self) -> Dict[str, List[str]]:
        """加载品牌域名映射"""
        return {
            "google": ["google", "gmail", "youtube"],
            "百度": ["baidu", "baidustatic"],
            "腾讯": ["tencent", "qq", "wechat"],
            "阿里巴巴": ["alibaba", "taobao", "tmall"],
            "京东": ["jd"],
            "美团": ["meituan"],
            "滴滴": ["didichuxing"],
            "字节跳动": ["bytedance", "toutiao", "douyin"],
            "华为": ["huawei"],
            "小米": ["xiaomi"],
            "支付宝": ["alipay"],
            "微信": ["wechat", "weixin"],
            "github": ["github"],
            "microsoft": ["microsoft", "live", "office"],
        }

    def check_url_length(self, url: str, threshold: float = 200.0) -> Dict[str, Any]:
        """检查URL长度异常"""
        matched = len(url) > threshold
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "url_length",
            "rule_name": "URL长度异常",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": f"URL长度为{len(url)}，超过阈值{threshold}" if matched else "URL长度正常",
        }

    def check_ip_direct(self, url: str) -> Dict[str, Any]:
        """检查IP直连"""
        ip_pattern = r"\b(?:\d{1,3}\.){3}\d{1,3}\b"
        matched = bool(re.search(ip_pattern, url))
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "ip_direct",
            "rule_name": "IP直连",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": "URL中包含IP地址" if matched else "URL中不包含IP地址",
        }

    def check_suspicious_subdomain(self, domain: str) -> Dict[str, Any]:
        """检查可疑子域"""
        suspicious_subdomains = ["login", "secure", "account", "verify", "signin", "auth"]
        subdomains = domain.split(".")
        matched = any(sub in suspicious_subdomains for sub in subdomains)
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "suspicious_subdomain",
            "rule_name": "可疑子域",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": "域名包含可疑子域" if matched else "域名不包含可疑子域",
        }

    def check_risky_path(self, url: str) -> Dict[str, Any]:
        """检查高风险路径词"""
        risky_paths = ["phish", "login", "verify", "account", "secure", "signin"]
        matched = any(path in url.lower() for path in risky_paths)
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "risky_path",
            "rule_name": "高风险路径词",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": "URL包含高风险路径词" if matched else "URL不包含高风险路径词",
        }

    def check_password_field(self, has_password_input: Optional[bool]) -> Dict[str, Any]:
        """检查存在密码框"""
        matched = bool(has_password_input)
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "password_field",
            "rule_name": "存在密码框",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": "页面存在密码输入框" if matched else "页面不存在密码输入框",
        }

    def check_cross_domain_form(self, domain: str, form_action_domains: List[str]) -> Dict[str, Any]:
        """检查表单action跨域"""
        matched = any(action_domain and action_domain != domain for action_domain in form_action_domains)
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "cross_domain_form",
            "rule_name": "表单action跨域",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": "表单提交到不同域名" if matched else "表单提交到相同域名",
        }

    def check_risky_keywords(self, text: str) -> Dict[str, Any]:
        """检查高风险诱导词"""
        matched = any(keyword.lower() in text.lower() for keyword in self.risk_keywords)
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "risky_keywords",
            "rule_name": "高风险诱导词",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": "页面包含高风险诱导词" if matched else "页面不包含高风险诱导词",
        }

    def check_brand_impersonation(self, domain: str, text: str) -> Dict[str, Any]:
        """检查品牌冒充词"""
        text_lower = text.lower()
        domain_lower = domain.lower()

        matched = False
        impersonated_brands = []

        for brand, official_domains in self.brand_domain_map.items():
            if brand.lower() in text_lower:
                has_official_domain = any(official_domain in domain_lower for official_domain in official_domains)
                if not has_official_domain:
                    matched = True
                    impersonated_brands.append(brand)

        if not matched and self.brand_keywords:
            for keyword in self.brand_keywords:
                if keyword.lower() in text_lower and keyword.lower() not in domain_lower:
                    matched = True
                    impersonated_brands.append(keyword)

        raw_score = 1.0 if matched else 0.0

        if matched:
            if impersonated_brands:
                detail = f"页面包含品牌关键词{'、'.join(impersonated_brands)}但域名不包含官方域名关键词"
            else:
                detail = "页面包含品牌关键词但域名不包含"
        else:
            detail = "页面不包含品牌关键词或域名包含对应品牌的官方域名关键词"

        return {
            "rule_key": "brand_impersonation",
            "rule_name": "品牌冒充词",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": detail,
        }

    def check_title_domain_mismatch(self, title: str, domain: str) -> Dict[str, Any]:
        """检查标题与域名不匹配"""
        if not title or not domain:
            return {
                "rule_key": "title_domain_mismatch",
                "rule_name": "标题与域名不匹配",
                "matched": False,
                "raw_score": 0.0,
                "weighted_score": 0.0,
                "detail": "标题或域名为空，无法判断匹配度",
            }

        title_words = set(re.findall(r"\w+", title.lower()))
        domain_words = set(re.findall(r"\w+", domain.lower()))

        stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"}
        title_words = title_words - stop_words
        domain_words = domain_words - stop_words

        if not title_words:
            return {
                "rule_key": "title_domain_mismatch",
                "rule_name": "标题与域名不匹配",
                "matched": False,
                "raw_score": 0.0,
                "weighted_score": 0.0,
                "detail": "标题中无有效关键词，无法判断匹配度",
            }

        matched_words = title_words & domain_words
        match_ratio = len(matched_words) / len(title_words)

        matched = match_ratio < 0.3
        raw_score = 1.0 if matched else 0.0

        return {
            "rule_key": "title_domain_mismatch",
            "rule_name": "标题与域名不匹配",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": f"标题与域名匹配度为{match_ratio:.2f}，低于阈值0.3" if matched else f"标题与域名匹配度为{match_ratio:.2f}，高于阈值0.3",
        }

    def check_suspicious_redirect(self, text: str) -> Dict[str, Any]:
        """检查可疑跳转提示"""
        redirect_keywords = ["跳转", "重定向", "即将前往", "正在跳转", "倒计时"]
        matched = any(keyword in text.lower() for keyword in redirect_keywords)
        raw_score = 1.0 if matched else 0.0
        return {
            "rule_key": "suspicious_redirect",
            "rule_name": "可疑跳转提示",
            "matched": matched,
            "raw_score": raw_score,
            "weighted_score": raw_score,
            "detail": "页面包含可疑跳转提示" if matched else "页面不包含可疑跳转提示",
        }

    def execute_rules(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """执行所有规则"""
        raw_features = features.get("raw_features", {}) or {}

        url = raw_features.get("url") or ""
        domain = features.get("domain") or ""
        title = raw_features.get("title") or ""
        visible_text = raw_features.get("visible_text") or ""
        button_texts = raw_features.get("button_texts") or []
        input_labels = raw_features.get("input_labels") or []
        form_action_domains = raw_features.get("form_action_domains") or []
        has_password_input = features.get("has_password_input", False)

        button_texts = [str(item) for item in button_texts if item]
        input_labels = [str(item) for item in input_labels if item]
        form_action_domains = [str(item) for item in form_action_domains if item]

        all_text_parts = [
            title,
            visible_text,
            " ".join(button_texts),
            " ".join(input_labels),
        ]
        all_text = " ".join(part for part in all_text_parts if part)

        hit_rules = []
        total_score = 0.0

        for rule in self.rules:
            rule_result = None

            if rule.rule_key == "url_length":
                rule_result = self.check_url_length(url, rule.threshold)
            elif rule.rule_key == "ip_direct":
                rule_result = self.check_ip_direct(url)
            elif rule.rule_key == "suspicious_subdomain":
                rule_result = self.check_suspicious_subdomain(domain)
            elif rule.rule_key == "risky_path":
                rule_result = self.check_risky_path(url)
            elif rule.rule_key == "password_field":
                rule_result = self.check_password_field(has_password_input)
            elif rule.rule_key == "cross_domain_form":
                rule_result = self.check_cross_domain_form(domain, form_action_domains)
            elif rule.rule_key == "risky_keywords":
                rule_result = self.check_risky_keywords(all_text)
            elif rule.rule_key == "brand_impersonation":
                rule_result = self.check_brand_impersonation(domain, all_text)
            elif rule.rule_key == "title_domain_mismatch":
                rule_result = self.check_title_domain_mismatch(title, domain)
            elif rule.rule_key == "suspicious_redirect":
                rule_result = self.check_suspicious_redirect(all_text)

            if rule_result:
                rule_result["weighted_score"] = rule_result["raw_score"] * rule.weight
                hit_rules.append(rule_result)
                total_score += rule_result["weighted_score"]

        max_possible_score = sum(rule.weight for rule in self.rules)
        rule_score = (total_score / max_possible_score) * 100 if max_possible_score > 0 else 0

        return {
            "rule_score": rule_score,
            "hit_rules": hit_rules,
        }