from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.database import Base
from app.services.detector import Detector

# 创建共享的 SQLite 内存测试数据库
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建测试表
Base.metadata.create_all(bind=engine)


def test_fuse_decision():
    """测试融合决策逻辑"""
    db = TestingSessionLocal()
    detector = Detector(db)
    
    # 测试恶意情况
    rule_score = 80.0
    model_probs = {
        'safe_prob': 0.1,
        'suspicious_prob': 0.2,
        'malicious_prob': 0.7
    }
    result = detector._fuse_decision(rule_score, model_probs)
    assert result['label'] == 'malicious'
    assert result['risk_score'] > 70.0
    
    # 测试可疑情况
    rule_score = 40.0
    model_probs = {
        'safe_prob': 0.3,
        'suspicious_prob': 0.6,
        'malicious_prob': 0.1
    }
    result = detector._fuse_decision(rule_score, model_probs)
    assert result['label'] == 'suspicious'
    assert 30.0 < result['risk_score'] < 70.0
    
    # 测试安全情况
    rule_score = 10.0
    model_probs = {
        'safe_prob': 0.9,
        'suspicious_prob': 0.05,
        'malicious_prob': 0.05
    }
    result = detector._fuse_decision(rule_score, model_probs)
    assert result['label'] == 'safe'
    assert result['risk_score'] < 30.0
    
    db.close()


def test_build_result():
    """测试构建结果逻辑"""
    db = TestingSessionLocal()
    detector = Detector(db)
    
    # 测试黑白名单结果
    domain_list_result = {
        'label': 'malicious',
        'reason': '域名在黑名单中'
    }
    result = detector._build_result(domain_list_result, None)
    assert result['label'] == 'malicious'
    assert result['risk_score'] == 100.0
    assert result['rule_score'] == 0.0
    assert result['model_safe_prob'] == 0.0
    assert result['model_malicious_prob'] == 1.0
    
    # 测试流水线结果
    pipeline_result = {
        'fuse_result': {
            'label': 'safe',
            'risk_score': 10.0
        },
        'rule_score': 5.0,
        'hit_rules': [],
        'model_result': {
            'safe_prob': 0.9,
            'suspicious_prob': 0.05,
            'malicious_prob': 0.05
        },
        'score_breakdown': {
            'final_score': 10.0,
            'label': 'safe',
        },
        'explanation': '测试解释',
        'recommendation': '测试建议'
    }
    result = detector._build_result(None, pipeline_result)
    assert result['label'] == 'safe'
    assert result['risk_score'] == 10.0
    assert result['rule_score'] == 5.0
    assert result['model_safe_prob'] == 0.9
    
    # 测试默认结果
    result = detector._build_result(None, None)
    assert result['label'] == 'safe'
    assert result['risk_score'] == 0.0
    assert result['rule_score'] == 0.0
    assert result['model_safe_prob'] == 1.0
    
    db.close()
