from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db
from ..schemas import FeedbackCaseCreate, FeedbackCaseItem
from ..services.platform_service import PlatformService


router = APIRouter(prefix="/api/v1", tags=["feedback"])


def current_username(x_webguard_user: str | None = Header(default=None)) -> str:
    return (x_webguard_user or "platform-user").strip() or "platform-user"


class FeedbackRequest(BaseModel):
    url: str | None = None
    related_report_id: int | None = None
    report_id: int | None = None
    related_event_id: int | None = None
    feedback_type: str = Field("false_positive", pattern="^(false_positive|false_negative|other)$")
    content: str | None = None
    source: str = "web"


@router.post("/feedback")
def create_feedback(
    request: FeedbackRequest,
    username: str = Depends(current_username),
    db: Session = Depends(get_db),
):
    case = PlatformService(db).create_feedback_case(
        username,
        FeedbackCaseCreate(
            url=request.url,
            report_id=request.related_report_id or request.report_id,
            related_report_id=request.related_report_id,
            related_event_id=request.related_event_id,
            feedback_type=request.feedback_type,
            status="pending_review",
            content=request.content,
            comment=request.content,
            source=request.source,
        ),
    )
    return {"success": True, "code": 0, "message": "feedback submitted", "data": FeedbackCaseItem.model_validate(case)}
