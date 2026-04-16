from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.sql import func

from ..core.database import Base


class UserSiteStrategy(Base):
    """用户级站点策略，供 Web 平台与浏览器助手共同使用。"""

    __tablename__ = "user_site_strategies"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), index=True, nullable=False)
    domain = Column(String(100), index=True, nullable=False)
    strategy_type = Column(String(20), nullable=False)  # trusted/blocked/paused
    reason = Column(Text)
    source = Column(String(20), default="web")  # web/plugin/report
    expires_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ReportAction(Base):
    """报告处置动作记录，用于承接用户与管理员处理流。"""

    __tablename__ = "report_actions"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, index=True, nullable=False)
    actor = Column(String(100), index=True, nullable=False)
    actor_role = Column(String(20), nullable=False)
    action_type = Column(String(50), index=True, nullable=False)
    status = Column(String(50), default="submitted")
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    """Platform user identity used by web pages, plugin sync and policy ownership."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    role = Column(String(20), default="user", nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PluginSyncEvent(Base):
    """Browser plugin event uploaded to the web platform as the source of truth."""

    __tablename__ = "plugin_sync_events"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), index=True, nullable=False)
    event_type = Column(String(50), index=True, nullable=False)
    action = Column(String(50), index=True)
    url = Column(String(1024))
    domain = Column(String(255), index=True)
    risk_label = Column(String(20), index=True)
    risk_score = Column(Float)
    summary = Column(Text)
    scan_record_id = Column(Integer, ForeignKey("scan_records.id"), index=True)
    plugin_version = Column(String(50))
    source = Column(String(20), default="plugin")
    metadata_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FeedbackCase(Base):
    """Feedback and false-positive case tracked in the web operations queue."""

    __tablename__ = "feedback_cases"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), index=True, nullable=False)
    report_id = Column(Integer, ForeignKey("scan_records.id"), index=True)
    url = Column(String(1024))
    domain = Column(String(255), index=True)
    feedback_type = Column(String(50), index=True, nullable=False)
    status = Column(String(50), default="pending_review", index=True)
    comment = Column(Text)
    source = Column(String(20), default="web", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
