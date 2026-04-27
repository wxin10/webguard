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
    email = Column(String(255), unique=True, index=True)
    display_name = Column(String(100), nullable=False)
    password_hash = Column(String(255))
    role = Column(String(20), default="user", nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True))


class RefreshToken(Base):
    """Server-side Web refresh-token session.

    Only a hash of the opaque refresh token is stored.
    """

    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String(128), unique=True, index=True, nullable=False)
    session_id = Column(String(128), unique=True, index=True, nullable=False)
    user_agent = Column(String(255))
    ip_address = Column(String(45))
    expires_at = Column(DateTime(timezone=True), index=True, nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    rotated_from_id = Column(Integer, ForeignKey("refresh_tokens.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True))


class PluginInstance(Base):
    """A browser extension instance bound to one WebGuard user."""

    __tablename__ = "plugin_instances"

    id = Column(Integer, primary_key=True, index=True)
    plugin_instance_id = Column(String(128), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    display_name = Column(String(100))
    browser_family = Column(String(50))
    plugin_version = Column(String(50))
    status = Column(String(20), default="active", index=True, nullable=False)
    bound_at = Column(DateTime(timezone=True))
    revoked_at = Column(DateTime(timezone=True))
    last_seen_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PluginBindingChallenge(Base):
    """Short-lived one-time challenge for binding an extension instance."""

    __tablename__ = "plugin_binding_challenges"

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(String(128), unique=True, index=True, nullable=False)
    plugin_instance_id = Column(String(128), index=True, nullable=False)
    binding_code_hash = Column(String(128), nullable=False)
    status = Column(String(20), default="pending", index=True, nullable=False)
    confirmed_by_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    expires_at = Column(DateTime(timezone=True), index=True, nullable=False)
    confirmed_at = Column(DateTime(timezone=True))
    consumed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    metadata_json = Column(JSON)


class PluginRefreshToken(Base):
    """Extension-scoped refresh session bound to one plugin instance."""

    __tablename__ = "plugin_refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    plugin_instance_id = Column(String(128), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String(128), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), index=True, nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    rotated_from_id = Column(Integer, ForeignKey("plugin_refresh_tokens.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True))


class UserPolicy(Base):
    """User-owned browser execution policy managed by the web platform."""

    __tablename__ = "user_policies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    auto_detect = Column(Boolean, default=True)
    auto_block_malicious = Column(Boolean, default=True)
    notify_suspicious = Column(Boolean, default=True)
    bypass_duration_minutes = Column(Integer, default=30)
    plugin_enabled = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Report(Base):
    """Materialized report owned by the web platform and linked to a scan record."""

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    scan_record_id = Column(Integer, ForeignKey("scan_records.id"), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    url = Column(String(1024), nullable=False)
    host = Column(String(255), index=True, nullable=False)
    risk_level = Column(String(20), index=True, nullable=False)
    risk_score = Column(Float, nullable=False)
    summary = Column(Text)
    reasons = Column(JSON)
    matched_rules = Column(JSON)
    page_signals = Column(JSON)
    recommendation = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DomainListItem(Base):
    """Unified domain-list item for global and user policy center views."""

    __tablename__ = "domain_list_items"

    id = Column(Integer, primary_key=True, index=True)
    owner_type = Column(String(20), index=True, nullable=False)  # global/user
    owner_id = Column(Integer, index=True)
    host = Column(String(255), index=True, nullable=False)
    list_type = Column(String(30), index=True, nullable=False)  # trusted/blocked/temp_bypass
    source = Column(String(30), default="manual", index=True)  # manual/plugin/system
    status = Column(String(20), default="active", index=True)
    reason = Column(Text)
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlatformSetting(Base):
    """Small key-value store for platform-level defaults such as plugin config."""

    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value_json = Column(JSON)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PluginSyncEvent(Base):
    """Browser plugin event uploaded to the web platform as the source of truth."""

    __tablename__ = "plugin_sync_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    username = Column(String(100), index=True, nullable=False)
    event_type = Column(String(50), index=True, nullable=False)
    action = Column(String(50), index=True)
    url = Column(String(1024))
    host = Column(String(255), index=True)
    domain = Column(String(255), index=True)
    risk_level = Column(String(20), index=True)
    risk_label = Column(String(20), index=True)
    risk_score = Column(Float)
    summary = Column(Text)
    scan_record_id = Column(Integer, ForeignKey("scan_records.id"), index=True)
    plugin_version = Column(String(50))
    source = Column(String(20), default="plugin")
    payload = Column(JSON)
    metadata_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FeedbackCase(Base):
    """Feedback and false-positive case tracked in the web operations queue."""

    __tablename__ = "feedback_cases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    username = Column(String(100), index=True, nullable=False)
    related_report_id = Column(Integer, ForeignKey("reports.id"), index=True)
    related_event_id = Column(Integer, ForeignKey("plugin_sync_events.id"), index=True)
    report_id = Column(Integer, ForeignKey("scan_records.id"), index=True)
    url = Column(String(1024))
    domain = Column(String(255), index=True)
    feedback_type = Column(String(50), index=True, nullable=False)
    status = Column(String(50), default="pending_review", index=True)
    content = Column(Text)
    comment = Column(Text)
    source = Column(String(20), default="web", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
