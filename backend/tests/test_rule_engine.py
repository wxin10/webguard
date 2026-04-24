from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.database import Base
from app.services.rule_engine import RuleEngine

# 创建共享的 SQLite 内存测试数据库
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建测试表
Base.metadata.create_all(bind=engine)


def build_context(**overrides):
    context = {
        "url": "http://example.com",
        "domain": "example.com",
        "title": "",
        "visible_text": "",
        "button_texts": [],
        "input_labels": [],
        "form_action_domains": [],
        "has_password_input": False,
        "all_text": "",
    }
    context.update(overrides)
    return context


def get_rule(rule_engine: RuleEngine, rule_key: str):
    return next(rule for rule in rule_engine.rules if rule.rule_key == rule_key)


def test_check_url_length():
    """测试URL长度检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)

    rule = get_rule(rule_engine, "url_length")
    rule.threshold = 100

    # 测试超长URL
    result = rule_engine.check_url_length(rule, build_context(url="http://example.com/" + "a" * 200))
    assert result["matched"] is True
    assert result["raw_score"] == 1.0
    assert result["rule_key"] == "url_length"

    # 测试正常URL
    result = rule_engine.check_url_length(rule, build_context(url="http://example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0

    db.close()


def test_check_ip_direct():
    """测试IP直连检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)

    rule = get_rule(rule_engine, "ip_direct")

    # 测试IP直连
    result = rule_engine.check_ip_direct(rule, build_context(url="http://192.168.1.1"))
    assert result["matched"] is True
    assert result["raw_score"] == 1.0
    assert result["rule_key"] == "ip_direct"

    # 测试正常域名
    result = rule_engine.check_ip_direct(rule, build_context(url="http://example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0

    db.close()


def test_check_suspicious_subdomain():
    """测试可疑子域检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)

    rule = get_rule(rule_engine, "suspicious_subdomain")

    # 测试可疑子域
    result = rule_engine.check_suspicious_subdomain(rule, build_context(domain="login.example.com"))
    assert result["matched"] is True
    assert result["raw_score"] == 1.0
    assert result["rule_key"] == "suspicious_subdomain"

    # 测试正常子域
    result = rule_engine.check_suspicious_subdomain(rule, build_context(domain="www.example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0

    db.close()


def test_check_title_domain_mismatch():
    """测试标题与域名不匹配检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)

    rule = get_rule(rule_engine, "title_domain_mismatch")

    # 测试不匹配情况
    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="Google - 搜索", domain="example.com"))
    assert result["rule_key"] == "title_domain_mismatch"
    assert result["matched"] is True

    # 测试匹配情况
    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="Example - 首页", domain="example.com"))
    assert result["rule_key"] == "title_domain_mismatch"
    assert result["matched"] is False

    # 测试空值情况
    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="", domain="example.com"))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0

    result = rule_engine.check_title_domain_mismatch(rule, build_context(title="Example", domain=""))
    assert result["matched"] is False
    assert result["raw_score"] == 0.0

    db.close()
