from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from ..core.database import Base


class BrandKeyword(Base):
    """品牌关键词模型"""
    __tablename__ = "brand_keywords"
    
    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String(100), unique=True, nullable=False)
    brand = Column(String(100), nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now())


class RiskKeyword(Base):
    """风险关键词模型"""
    __tablename__ = "risk_keywords"
    
    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String(100), unique=True, nullable=False)
    category = Column(String(50), nullable=False)
    severity = Column(Integer, nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now())
