from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class ScanRecordBase(BaseModel):
    user_id: Optional[int] = None
    report_id: Optional[int] = None
    url: str
    domain: str
    host: Optional[str] = None
    title: Optional[str] = None
    source: str
    label: str
    risk_level: Optional[str] = None
    risk_score: float
    rule_score: float
    model_safe_prob: float
    model_suspicious_prob: float
    model_malicious_prob: float
    has_password_input: Optional[bool] = None
    hit_rules_json: Optional[List[Dict[str, Any]]] = None
    raw_features_json: Optional[Dict[str, Any]] = None
    explanation: Optional[str] = None
    summary: Optional[str] = None
    recommendation: Optional[str] = None


class ScanRecordCreate(ScanRecordBase):
    pass


class ScanRecord(ScanRecordBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        item = super().model_validate(obj, *args, **kwargs)
        item.host = item.host or item.domain
        item.risk_level = item.risk_level or item.label
        item.summary = item.summary or item.explanation
        item.report_id = item.report_id or item.id
        return item


class ScanRecordList(BaseModel):
    total: int
    records: List[ScanRecord]
