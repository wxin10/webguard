from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class UserSiteStrategyCreate(BaseModel):
    domain: str
    reason: Optional[str] = None
    source: Optional[str] = "web"
    minutes: Optional[int] = None


class UserSiteStrategyItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    domain: str
    strategy_type: str
    reason: Optional[str] = None
    source: Optional[str] = None
    expires_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserStrategyOverview(BaseModel):
    trusted_sites: List[UserSiteStrategyItem]
    blocked_sites: List[UserSiteStrategyItem]
    paused_sites: List[UserSiteStrategyItem]


class ReportActionCreate(BaseModel):
    note: Optional[str] = None
    status: Optional[str] = None
    scope: Optional[str] = "user"


class ReportActionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_id: int
    actor: str
    actor_role: str
    action_type: str
    status: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
