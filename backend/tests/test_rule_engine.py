import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.services.rule_engine import RuleEngine

# 创建SQLite内存测试数据库
engine = create_engine("sqlite:///:memory:")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建测试表
Base.metadata.create_all(bind=engine)


def test_check_url_length():
    """测试URL长度检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)
    
    # 测试超长URL
    result = rule_engine.check_url_length("http://example.com/" + "a" * 200, threshold=100)
    assert result['matched'] is True
    assert result['raw_score'] == 1.0
    assert result['rule_key'] == 'url_length'
    
    # 测试正常URL
    result = rule_engine.check_url_length("http://example.com", threshold=100)
    assert result['matched'] is False
    assert result['raw_score'] == 0.0
    
    db.close()


def test_check_ip_direct():
    """测试IP直连检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)
    
    # 测试IP直连
    result = rule_engine.check_ip_direct("http://192.168.1.1")
    assert result['matched'] is True
    assert result['raw_score'] == 1.0
    assert result['rule_key'] == 'ip_direct'
    
    # 测试正常域名
    result = rule_engine.check_ip_direct("http://example.com")
    assert result['matched'] is False
    assert result['raw_score'] == 0.0
    
    db.close()


def test_check_suspicious_subdomain():
    """测试可疑子域检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)
    
    # 测试可疑子域
    result = rule_engine.check_suspicious_subdomain("login.example.com")
    assert result['matched'] is True
    assert result['raw_score'] == 1.0
    assert result['rule_key'] == 'suspicious_subdomain'
    
    # 测试正常子域
    result = rule_engine.check_suspicious_subdomain("www.example.com")
    assert result['matched'] is False
    assert result['raw_score'] == 0.0
    
    db.close()


def test_check_title_domain_mismatch():
    """测试标题与域名不匹配检查规则"""
    db = TestingSessionLocal()
    rule_engine = RuleEngine(db)
    
    # 测试不匹配情况
    result = rule_engine.check_title_domain_mismatch("Google - 搜索", "example.com")
    assert result['rule_key'] == 'title_domain_mismatch'
    
    # 测试匹配情况
    result = rule_engine.check_title_domain_mismatch("Example - 首页", "example.com")
    assert result['rule_key'] == 'title_domain_mismatch'
    
    # 测试空值情况
    result = rule_engine.check_title_domain_mismatch("", "example.com")
    assert result['matched'] is False
    assert result['raw_score'] == 0.0
    
    result = rule_engine.check_title_domain_mismatch("Example", "")
    assert result['matched'] is False
    assert result['raw_score'] == 0.0
    
    db.close()
