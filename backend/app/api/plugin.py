from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from ..core import get_db
from ..models import ReportAction as ReportActionModel
from ..schemas import ApiResponse, ScanResult
from ..services import Detector

router = APIRouter(prefix="/api/v1/plugin", tags=["plugin"])


class AnalyzeCurrentRequest(BaseModel):
    """分析当前页面请求"""
    url: str
    title: str
    visible_text: str
    button_texts: List[str] = Field(default_factory=list)
    input_labels: List[str] = Field(default_factory=list)
    form_action_domains: List[str] = Field(default_factory=list)
    has_password_input: bool = False


class FeedbackRequest(BaseModel):
    """反馈请求"""
    url: str
    feedback_type: str  # positive/negative
    comment: Optional[str] = None


@router.post("/analyze-current", response_model=ApiResponse[ScanResult])
def analyze_current(
    request: AnalyzeCurrentRequest,
    db: Session = Depends(get_db),
    x_webguard_user: str | None = Header(default=None),
):
    """分析当前页面"""
    detector = Detector(db)
    page_data = {
        "url": request.url,
        "title": request.title,
        "visible_text": request.visible_text,
        "button_texts": request.button_texts,
        "input_labels": request.input_labels,
        "form_action_domains": request.form_action_domains,
        "has_password_input": request.has_password_input
    }
    result = detector.detect_page(page_data, source="plugin", username=x_webguard_user or "platform-user")
    return {
        "code": 0,
        "message": "success",
        "data": result
    }


@router.post("/feedback", response_model=ApiResponse[dict])
def submit_feedback(
    request: FeedbackRequest,
    db: Session = Depends(get_db),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
):
    """提交反馈"""
    action = ReportActionModel(
        report_id=0,
        actor=x_webguard_user or "platform-user",
        actor_role=x_webguard_role or "user",
        action_type=request.feedback_type,
        status="pending_review",
        note=f"{request.url}\n{request.comment or ''}".strip(),
    )
    db.add(action)
    db.commit()
    return {
        "code": 0,
        "message": "反馈提交成功",
        "data": None
    }
