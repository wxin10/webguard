from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List


class RuleConfigBase(BaseModel):
    """规则配置基础模式"""
    rule_key: str
    rule_name: str
    description: Optional[str] = None
    weight: float
    threshold: float
    enabled: bool = True


class RuleConfigUpdate(BaseModel):
    """更新规则配置模式"""
    weight: Optional[float] = None
    threshold: Optional[float] = None
    enabled: Optional[bool] = None


class RuleConfig(RuleConfigBase):
    """规则配置响应模式"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    updated_at: datetime


class RuleConfigList(BaseModel):
    """规则配置列表响应模式"""
    total: int
    rules: List[RuleConfig]
