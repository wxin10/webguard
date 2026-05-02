from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from ..core.database import Base


class AIProviderConfig(Base):
    """Admin-managed AI provider configuration."""

    __tablename__ = "ai_provider_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), nullable=False, default="deepseek", index=True, unique=True)
    enabled = Column(Boolean, nullable=False, default=True)
    base_url = Column(String(512), nullable=False)
    model = Column(String(255), nullable=False)
    timeout_seconds = Column(Integer, nullable=False, default=20)
    encrypted_api_key = Column(Text)
    api_key_masked = Column(String(32))
    last_test_status = Column(String(50))
    last_test_message = Column(Text)
    last_test_at = Column(DateTime(timezone=True))
    updated_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
