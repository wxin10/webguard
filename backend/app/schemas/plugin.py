from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PluginDefaultConfig(BaseModel):
    api_base_url: str = "http://127.0.0.1:8000"
    web_base_url: str = "http://127.0.0.1:5173"
    auto_detect: bool = True
    auto_block_malicious: bool = True
    notify_suspicious: bool = True
    event_upload_enabled: bool = True


class PluginPolicyBundle(BaseModel):
    username: str
    plugin_version: str = "1.0.0"
    rule_version: str
    defaults: PluginDefaultConfig
    user_trusted_hosts: List[str]
    user_blocked_hosts: List[str]
    user_paused_hosts: List[Dict[str, Any]]
    global_trusted_hosts: List[str]
    global_blocked_hosts: List[str]
    generated_at: datetime


class PluginSyncEventCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=50)
    action: Optional[str] = Field(default=None, max_length=50)
    url: Optional[str] = None
    domain: Optional[str] = None
    host: Optional[str] = None
    risk_level: Optional[str] = None
    risk_label: Optional[str] = None
    risk_score: Optional[float] = None
    summary: Optional[str] = None
    scan_record_id: Optional[int] = None
    related_report_id: Optional[int] = None
    plugin_version: Optional[str] = "1.0.0"
    payload: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PluginSyncEventItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    username: str
    event_type: str
    action: Optional[str] = None
    url: Optional[str] = None
    host: Optional[str] = None
    domain: Optional[str] = None
    risk_level: Optional[str] = None
    risk_label: Optional[str] = None
    risk_score: Optional[float] = None
    summary: Optional[str] = None
    scan_record_id: Optional[int] = None
    plugin_version: Optional[str] = None
    source: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime


class PluginSyncEventList(BaseModel):
    total: int
    events: List[PluginSyncEventItem]


class PluginEventStats(BaseModel):
    total_events: int
    scan_events: int
    warning_events: int
    bypass_events: int
    trust_events: int
    feedback_events: int
    malicious_events: int
    suspicious_events: int


class FeedbackCaseCreate(BaseModel):
    url: Optional[str] = None
    report_id: Optional[int] = None
    related_report_id: Optional[int] = None
    related_event_id: Optional[int] = None
    feedback_type: str = "false_positive"
    status: str = "pending_review"
    content: Optional[str] = None
    comment: Optional[str] = None
    source: str = "web"


class FeedbackCaseItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    username: str
    report_id: Optional[int] = None
    related_report_id: Optional[int] = None
    related_event_id: Optional[int] = None
    url: Optional[str] = None
    domain: Optional[str] = None
    feedback_type: str
    status: str
    content: Optional[str] = None
    comment: Optional[str] = None
    source: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class FeedbackCaseList(BaseModel):
    total: int
    cases: List[FeedbackCaseItem]
