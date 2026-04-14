from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
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
