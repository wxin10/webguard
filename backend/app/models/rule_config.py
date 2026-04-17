from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from ..core.database import Base


class RuleConfig(Base):
    """Rule configuration persisted for explainable scoring."""

    __tablename__ = "rule_configs"

    id = Column(Integer, primary_key=True, index=True)
    rule_key = Column(String(50), unique=True, nullable=False)
    rule_name = Column(String(100), nullable=False)
    description = Column(Text)
    type = Column(String(50), default="heuristic")
    scope = Column(String(20), default="global")
    status = Column(String(20), default="active")
    version = Column(String(50), default="v1")
    pattern = Column(String(255))
    content = Column(Text)
    category = Column(String(50), default="general")
    severity = Column(String(20), default="medium")
    weight = Column(Float, nullable=False)
    threshold = Column(Float, nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def name(self) -> str:
        return self.rule_name
