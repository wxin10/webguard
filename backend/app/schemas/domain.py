from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DomainWhitelistBase(BaseModel):
    """域名白名单基础模式"""
    domain: str
    reason: Optional[str] = None


class DomainWhitelistCreate(DomainWhitelistBase):
    """创建域名白名单模式"""
    pass


class DomainWhitelist(DomainWhitelistBase):
    """域名白名单响应模式"""
    id: int
    added_at: datetime
    
    class Config:
        from_attributes = True


class DomainBlacklistBase(BaseModel):
    """域名黑名单基础模式"""
    domain: str
    reason: Optional[str] = None
    risk_type: Optional[str] = None


class DomainBlacklistCreate(DomainBlacklistBase):
    """创建域名黑名单模式"""
    pass


class DomainBlacklist(DomainBlacklistBase):
    """域名黑名单响应模式"""
    id: int
    added_at: datetime
    
    class Config:
        from_attributes = True


class DomainList(BaseModel):
    """域名列表响应模式"""
    total: int
    items: List[DomainWhitelist | DomainBlacklist]
