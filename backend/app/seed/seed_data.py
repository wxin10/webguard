import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy.orm import Session

from app.core.database import Base, SessionLocal, engine
from app.models import BrandKeyword, DomainBlacklist, DomainWhitelist, RiskKeyword, RuleConfig, ScanRecord


def seed_rules(db: Session) -> None:
    rules = [
        {"rule_key": "url_length", "rule_name": "URL complexity signal", "weight": 8.0, "threshold": 120.0},
        {"rule_key": "ip_direct", "rule_name": "Direct IP host", "weight": 14.0, "threshold": 1.0},
        {"rule_key": "suspicious_subdomain", "rule_name": "Sensitive subdomain wording", "weight": 8.0, "threshold": 1.0},
        {"rule_key": "risky_path", "rule_name": "Sensitive path wording", "weight": 12.0, "threshold": 1.0},
        {"rule_key": "password_field", "rule_name": "Password input present", "weight": 7.0, "threshold": 1.0},
        {"rule_key": "cross_domain_form", "rule_name": "Cross-domain form submission", "weight": 12.0, "threshold": 1.0},
        {"rule_key": "risky_keywords", "rule_name": "Risky persuasion wording", "weight": 12.0, "threshold": 1.0},
        {"rule_key": "brand_impersonation", "rule_name": "Possible brand impersonation", "weight": 14.0, "threshold": 1.0},
        {"rule_key": "title_domain_mismatch", "rule_name": "Low title-domain similarity", "weight": 5.0, "threshold": 0.3},
        {"rule_key": "suspicious_redirect", "rule_name": "Redirect or countdown signal", "weight": 6.0, "threshold": 1.0},
    ]
    for rule_data in rules:
        existing = db.query(RuleConfig).filter(RuleConfig.rule_key == rule_data["rule_key"]).first()
        if existing:
            continue
        db.add(
            RuleConfig(
                **rule_data,
                description="Seeded baseline rule.",
                category="seed",
                severity="medium",
                enabled=True,
                type="heuristic",
                scope="global",
                version="seed-v1",
            )
        )
    db.commit()


def seed_brand_keywords(db: Session) -> None:
    for keyword in ["paypal", "alipay", "wechat", "google", "microsoft", "apple", "amazon"]:
        if not db.query(BrandKeyword).filter(BrandKeyword.keyword == keyword).first():
            db.add(BrandKeyword(keyword=keyword, brand=keyword))
    db.commit()


def seed_risk_keywords(db: Session) -> None:
    items = [
        ("password", "phishing", 4),
        ("verification code", "phishing", 4),
        ("account", "phishing", 3),
        ("payment", "scam", 4),
        ("wallet", "scam", 4),
        ("private key", "scam", 5),
    ]
    for keyword, category, severity in items:
        if not db.query(RiskKeyword).filter(RiskKeyword.keyword == keyword).first():
            db.add(RiskKeyword(keyword=keyword, category=category, severity=severity))
    db.commit()


def seed_domain_whitelist(db: Session) -> None:
    for domain, reason in [("example.com", "Safe demo domain"), ("baidu.com", "Known search portal")]:
        if not db.query(DomainWhitelist).filter(DomainWhitelist.domain == domain).first():
            db.add(DomainWhitelist(domain=domain, reason=reason, source="seed", status="active"))
    db.commit()


def seed_domain_blacklist(db: Session) -> None:
    for domain, reason, risk_type in [
        ("phishing-example.com", "Seeded phishing demo domain", "phishing"),
        ("scam-site.com", "Seeded scam demo domain", "scam"),
    ]:
        if not db.query(DomainBlacklist).filter(DomainBlacklist.domain == domain).first():
            db.add(DomainBlacklist(domain=domain, reason=reason, risk_type=risk_type, source="seed", status="active"))
    db.commit()


def seed_scan_records(db: Session) -> None:
    records = [
        {
            "url": "https://example.com",
            "domain": "example.com",
            "title": "Example Domain",
            "source": "manual",
            "label": "safe",
            "risk_score": 0.0,
            "rule_score": 0.0,
            "model_safe_prob": 1.0,
            "model_suspicious_prob": 0.0,
            "model_malicious_prob": 0.0,
            "has_password_input": False,
            "hit_rules_json": [],
            "raw_features_json": {"url": "https://example.com", "domain": "example.com", "title": "Example Domain"},
            "explanation": "Seeded safe record.",
            "recommendation": "Continue browsing with normal caution.",
        },
        {
            "url": "https://phishing-example.com/login",
            "domain": "phishing-example.com",
            "title": "Account verification",
            "source": "manual",
            "label": "malicious",
            "risk_score": 100.0,
            "rule_score": 100.0,
            "model_safe_prob": 0.0,
            "model_suspicious_prob": 0.0,
            "model_malicious_prob": 1.0,
            "has_password_input": True,
            "hit_rules_json": [],
            "raw_features_json": {"url": "https://phishing-example.com/login", "domain": "phishing-example.com"},
            "explanation": "Seeded blocked demo domain.",
            "recommendation": "Do not enter credentials on this site.",
        },
    ]
    for record_data in records:
        if not db.query(ScanRecord).filter(ScanRecord.url == record_data["url"]).first():
            db.add(ScanRecord(**record_data))
    db.commit()


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_rules(db)
        seed_brand_keywords(db)
        seed_risk_keywords(db)
        seed_domain_whitelist(db)
        seed_domain_blacklist(db)
        seed_scan_records(db)
        print("Seed data initialized.")
    except Exception as exc:
        db.rollback()
        print(f"Failed to initialize seed data: {exc}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
