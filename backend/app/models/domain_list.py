from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from ..core.database import Base


class DomainWhitelist(Base):
    """域名白名单模型"""
    __tablename__ = "domain_whitelist"
    
    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String(100), unique=True, nullable=False)
    reason = Column(Text)
    source = Column(String(50), default="admin")
    status = Column(String(20), default="active")
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DomainBlacklist(Base):
    """域名黑名单模型"""
    __tablename__ = "domain_blacklist"
    
    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String(100), unique=True, nullable=False)
    reason = Column(Text)
    risk_type = Column(String(50))
    source = Column(String(50), default="admin")
    status = Column(String(20), default="active")
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
