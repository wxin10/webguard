from pydantic import BaseModel, Field
from typing import List, Optional


class UrlScanRequest(BaseModel):
    """URL扫描请求"""
    url: str = Field(..., description="要扫描的URL")


class PageScanRequest(BaseModel):
    """页面扫描请求"""
    url: str = Field(..., description="页面URL")
    title: str = Field(..., description="页面标题")
    visible_text: str = Field(..., description="页面可见文本")
    button_texts: List[str] = Field(default_factory=list, description="按钮文本列表")
    input_labels: List[str] = Field(default_factory=list, description="输入框标签列表")
    form_action_domains: List[str] = Field(default_factory=list, description="表单action域名列表")
    has_password_input: bool = Field(False, description="是否有密码输入框")
    source: str = Field("manual", description="扫描来源")


class HitRule(BaseModel):
    """命中的规则"""
    rule_key: str
    rule_name: str
    matched: bool
    raw_score: float
    weighted_score: float
    detail: Optional[str] = None


class ScanResult(BaseModel):
    """扫描结果"""
    label: str
    risk_score: float
    rule_score: float
    model_safe_prob: float
    model_suspicious_prob: float
    model_malicious_prob: float
    hit_rules: List[HitRule]
    explanation: str
    recommendation: str
    record_id: int
