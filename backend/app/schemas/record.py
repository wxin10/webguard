from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any, List


class ScanRecordBase(BaseModel):
    """扫描记录基础模式"""
    url: str
    domain: str
    title: Optional[str] = None
    source: str
    label: str
    risk_score: float
    rule_score: float
    model_safe_prob: float
    model_suspicious_prob: float
    model_malicious_prob: float
    has_password_input: Optional[bool] = None
    hit_rules_json: Optional[List[Dict[str, Any]]] = None
    raw_features_json: Optional[Dict[str, Any]] = None
    explanation: Optional[str] = None
    recommendation: Optional[str] = None


class ScanRecordCreate(ScanRecordBase):
    """创建扫描记录模式"""
    pass


class ScanRecord(ScanRecordBase):
    """扫描记录响应模式"""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class ScanRecordList(BaseModel):
    """扫描记录列表响应模式"""
    total: int
    records: List[ScanRecord]
