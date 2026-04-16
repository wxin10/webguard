from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class DomainWhitelistBase(BaseModel):
    domain: str
    reason: Optional[str] = None
    source: Optional[str] = "admin"
    status: Optional[str] = "active"


class DomainWhitelistCreate(DomainWhitelistBase):
    pass


class DomainWhitelist(DomainWhitelistBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    added_at: datetime
    updated_at: Optional[datetime] = None


class DomainBlacklistBase(BaseModel):
    domain: str
    reason: Optional[str] = None
    risk_type: Optional[str] = None
    source: Optional[str] = "admin"
    status: Optional[str] = "active"


class DomainBlacklistCreate(DomainBlacklistBase):
    pass


class DomainBlacklist(DomainBlacklistBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    added_at: datetime
    updated_at: Optional[datetime] = None


class DomainList(BaseModel):
    total: int
    items: List[DomainWhitelist | DomainBlacklist]
