import sys
import os
# 添加项目根目录到路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy.orm import Session
from app.core.database import engine, Base, SessionLocal
from app.models import (
    RuleConfig, BrandKeyword, RiskKeyword, 
    DomainWhitelist, DomainBlacklist, ModelVersion,
    ScanRecord
)

def seed_rules(db: Session):
    """初始化规则配置"""
    rules = [
        {
            "rule_key": "url_length",
            "rule_name": "URL长度异常",
            "description": "检测URL长度是否异常，过长的URL可能包含恶意代码",
            "weight": 0.3,
            "threshold": 200.0,
            "enabled": True
        },
        {
            "rule_key": "ip_direct",
            "rule_name": "IP直连",
            "description": "检测URL是否使用IP地址直接访问",
            "weight": 0.4,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "suspicious_subdomain",
            "rule_name": "可疑子域",
            "description": "检测URL是否包含可疑的子域名",
            "weight": 0.35,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "risky_path",
            "rule_name": "高风险路径词",
            "description": "检测URL路径是否包含高风险词汇",
            "weight": 0.45,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "password_field",
            "rule_name": "存在密码框",
            "description": "检测页面是否包含密码输入框",
            "weight": 0.5,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "cross_domain_form",
            "rule_name": "表单action跨域",
            "description": "检测表单提交地址是否与当前域名不同",
            "weight": 0.6,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "risky_keywords",
            "rule_name": "高风险诱导词",
            "description": "检测页面是否包含高风险诱导词汇",
            "weight": 0.55,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "brand_impersonation",
            "rule_name": "品牌冒充词",
            "description": "检测页面是否包含品牌关键词但域名与品牌不符",
            "weight": 0.7,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "title_domain_mismatch",
            "rule_name": "标题与域名不匹配",
            "description": "检测页面标题是否与域名相关",
            "weight": 0.3,
            "threshold": 0.0,
            "enabled": True
        },
        {
            "rule_key": "suspicious_redirect",
            "rule_name": "可疑跳转提示",
            "description": "检测页面是否包含可疑的跳转提示",
            "weight": 0.4,
            "threshold": 0.0,
            "enabled": True
        }
    ]
    
    for rule_data in rules:
        existing = db.query(RuleConfig).filter(RuleConfig.rule_key == rule_data["rule_key"]).first()
        if not existing:
            rule = RuleConfig(**rule_data)
            db.add(rule)
    
    db.commit()
    print("规则配置初始化完成")

def seed_brand_keywords(db: Session):
    """初始化品牌关键词"""
    brand_keywords = [
        {"keyword": "支付宝", "brand": "支付宝"},
        {"keyword": "微信", "brand": "微信"},
        {"keyword": "淘宝", "brand": "淘宝"},
        {"keyword": "京东", "brand": "京东"},
        {"keyword": "百度", "brand": "百度"},
        {"keyword": "腾讯", "brand": "腾讯"},
        {"keyword": "网易", "brand": "网易"},
        {"keyword": "新浪", "brand": "新浪"},
        {"keyword": "拼多多", "brand": "拼多多"},
        {"keyword": "抖音", "brand": "抖音"},
        {"keyword": "快手", "brand": "快手"}
    ]
    
    for kw_data in brand_keywords:
        existing = db.query(BrandKeyword).filter(BrandKeyword.keyword == kw_data["keyword"]).first()
        if not existing:
            keyword = BrandKeyword(**kw_data)
            db.add(keyword)
    
    db.commit()
    print("品牌关键词初始化完成")

def seed_risk_keywords(db: Session):
    """初始化风险关键词"""
    risk_keywords = [
        {"keyword": "钓鱼", "category": "phishing", "severity": 5},
        {"keyword": "诈骗", "category": "phishing", "severity": 5},
        {"keyword": "中奖", "category": "scam", "severity": 4},
        {"keyword": "密码", "category": "phishing", "severity": 4},
        {"keyword": "账号", "category": "phishing", "severity": 4},
        {"keyword": "验证码", "category": "phishing", "severity": 4},
        {"keyword": "充值", "category": "scam", "severity": 3},
        {"keyword": "转账", "category": "scam", "severity": 4},
        {"keyword": "领奖", "category": "scam", "severity": 3},
        {"keyword": "紧急", "category": "scam", "severity": 3},
        {"keyword": "验证", "category": "phishing", "severity": 4}
    ]
    
    for kw_data in risk_keywords:
        existing = db.query(RiskKeyword).filter(RiskKeyword.keyword == kw_data["keyword"]).first()
        if not existing:
            keyword = RiskKeyword(**kw_data)
            db.add(keyword)
    
    db.commit()
    print("风险关键词初始化完成")

def seed_domain_whitelist(db: Session):
    """初始化域名白名单"""
    whitelist = [
        {"domain": "baidu.com", "reason": "百度官方网站"},
        {"domain": "taobao.com", "reason": "淘宝官方网站"},
        {"domain": "jd.com", "reason": "京东官方网站"}
    ]
    
    for domain_data in whitelist:
        existing = db.query(DomainWhitelist).filter(DomainWhitelist.domain == domain_data["domain"]).first()
        if not existing:
            domain = DomainWhitelist(**domain_data)
            db.add(domain)
    
    db.commit()
    print("域名白名单初始化完成")

def seed_domain_blacklist(db: Session):
    """初始化域名黑名单"""
    blacklist = [
        {"domain": "phishing-example.com", "reason": "钓鱼网站示例", "risk_type": "phishing"},
        {"domain": "scam-site.com", "reason": "诈骗网站示例", "risk_type": "scam"},
        {"domain": "malicious-site.com", "reason": "恶意网站示例", "risk_type": "malware"}
    ]
    
    for domain_data in blacklist:
        existing = db.query(DomainBlacklist).filter(DomainBlacklist.domain == domain_data["domain"]).first()
        if not existing:
            domain = DomainBlacklist(**domain_data)
            db.add(domain)
    
    db.commit()
    print("域名黑名单初始化完成")

def seed_model_versions(db: Session):
    """初始化模型版本"""
    models = [
        {
            "version": "1.0.0",
            "name": "初始模型",
            "path": "./models/text_classifier_v1",
            "accuracy": 0.85,
            "precision": 0.82,
            "recall": 0.80,
            "f1_score": 0.81,
            "is_active": True
        },
        {
            "version": "1.1.0",
            "name": "优化模型",
            "path": "./models/text_classifier_v1_1",
            "accuracy": 0.88,
            "precision": 0.86,
            "recall": 0.84,
            "f1_score": 0.85,
            "is_active": False
        }
    ]
    
    for model_data in models:
        existing = db.query(ModelVersion).filter(ModelVersion.version == model_data["version"]).first()
        if not existing:
            model = ModelVersion(**model_data)
            db.add(model)
    
    db.commit()
    print("模型版本初始化完成")

def seed_scan_records(db: Session):
    """初始化扫描记录"""
    records = [
        {
            "url": "https://www.baidu.com",
            "domain": "baidu.com",
            "title": "百度一下，你就知道",
            "source": "manual",
            "label": "safe",
            "risk_score": 0.0,
            "rule_score": 0.0,
            "model_safe_prob": 0.95,
            "model_suspicious_prob": 0.03,
            "model_malicious_prob": 0.02,
            "has_password_input": False,
            "hit_rules_json": [],
            "raw_features_json": {
                "url": "https://www.baidu.com",
                "domain": "baidu.com",
                "title": "百度一下，你就知道",
                "visible_text": "百度一下，你就知道",
                "button_texts": ["百度一下"],
                "input_labels": ["请输入关键词"],
                "form_action_domains": ["baidu.com"],
                "has_password_input": False
            },
            "explanation": "域名在白名单中: 百度官方网站",
            "recommendation": "建议：网站安全，可以正常访问。"
        },
        {
            "url": "https://phishing-example.com/login",
            "domain": "phishing-example.com",
            "title": "支付宝登录",
            "source": "manual",
            "label": "malicious",
            "risk_score": 100.0,
            "rule_score": 0.0,
            "model_safe_prob": 0.05,
            "model_suspicious_prob": 0.15,
            "model_malicious_prob": 0.80,
            "has_password_input": True,
            "hit_rules_json": [],
            "raw_features_json": {
                "url": "https://phishing-example.com/login",
                "domain": "phishing-example.com",
                "title": "支付宝登录",
                "visible_text": "支付宝登录，请输入账号密码",
                "button_texts": ["登录"],
                "input_labels": ["账号", "密码"],
                "form_action_domains": ["phishing-example.com"],
                "has_password_input": True
            },
            "explanation": "域名在黑名单中: 钓鱼网站示例",
            "recommendation": "建议：不要访问此网站，可能存在钓鱼或恶意行为。"
        }
    ]
    
    for record_data in records:
        existing = db.query(ScanRecord).filter(ScanRecord.url == record_data["url"]).first()
        if not existing:
            record = ScanRecord(**record_data)
            db.add(record)
    
    db.commit()
    print("扫描记录初始化完成")

def main():
    """主函数"""
    # 创建数据库表
    Base.metadata.create_all(bind=engine)
    
    # 创建数据库会话
    db = SessionLocal()
    
    try:
        # 初始化数据
        seed_rules(db)
        seed_brand_keywords(db)
        seed_risk_keywords(db)
        seed_domain_whitelist(db)
        seed_domain_blacklist(db)
        seed_model_versions(db)
        seed_scan_records(db)
        
        print("所有种子数据初始化完成")
    except Exception as e:
        print(f"初始化数据时出错: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
