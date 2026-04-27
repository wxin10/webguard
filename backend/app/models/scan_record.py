from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from ..core.database import Base


class ScanRecord(Base):
    """扫描记录模型"""
    __tablename__ = "scan_records"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    report_id = Column(Integer, index=True)
    url = Column(String(255), nullable=False)
    domain = Column(String(100), nullable=False)
    title = Column(String(255))
    source = Column(String(20), nullable=False)  # manual/plugin
    label = Column(String(20), nullable=False)  # safe/suspicious/malicious
    risk_score = Column(Float, nullable=False)
    rule_score = Column(Float, nullable=False)
    model_safe_prob = Column(Float, nullable=False)
    model_suspicious_prob = Column(Float, nullable=False)
    model_malicious_prob = Column(Float, nullable=False)
    has_password_input = Column(Boolean)
    hit_rules_json = Column(JSON)
    raw_features_json = Column(JSON)
    explanation = Column(Text)
    recommendation = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
