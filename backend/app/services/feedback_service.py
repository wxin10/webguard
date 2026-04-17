from __future__ import annotations

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models import FeedbackCase
from ..schemas import FeedbackCaseCreate
from .domain_service import normalize_domain
from .user_service import UserService


class FeedbackService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserService(db)

    def create_case(self, username: str, request: FeedbackCaseCreate, report_service=None) -> FeedbackCase:
        user = self.users.get_or_create_user(username)
        record = None
        if request.report_id and report_service is not None:
            record = report_service.record_for_report_id(request.report_id)
        url = request.url or (record.url if record else None)
        report_id = None
        scan_record_id = request.report_id
        if record and report_service is not None:
            report = report_service.ensure_report_for_record(record)
            report_id = report.id
            scan_record_id = record.id

        case = FeedbackCase(
            user_id=user.id,
            username=username,
            related_report_id=report_id or request.related_report_id,
            related_event_id=request.related_event_id,
            report_id=scan_record_id,
            url=url,
            domain=normalize_domain(url),
            feedback_type=request.feedback_type,
            status=request.status,
            content=request.content or request.comment,
            comment=request.comment or request.content,
            source=request.source,
        )
        self.db.add(case)
        self.db.commit()
        self.db.refresh(case)
        return case

    def list_cases(
        self,
        *,
        username: str,
        role: str,
        page: int,
        page_size: int,
        status: str | None = None,
    ) -> tuple[int, list[FeedbackCase]]:
        query = self.db.query(FeedbackCase)
        if role != "admin":
            user = self.users.get_or_create_user(username)
            query = query.filter((FeedbackCase.username == username) | (FeedbackCase.user_id == user.id))
        if status:
            query = query.filter(FeedbackCase.status == status)
        total = query.count()
        cases = query.order_by(desc(FeedbackCase.created_at)).offset((page - 1) * page_size).limit(page_size).all()
        return total, cases

    def update_case(self, case_id: int, status: str, comment: str | None = None) -> FeedbackCase | None:
        case = self.db.query(FeedbackCase).filter(FeedbackCase.id == case_id).first()
        if not case:
            return None
        case.status = status
        if comment:
            case.comment = f"{case.comment or ''}\n{comment}".strip()
            case.content = case.comment
        self.db.commit()
        self.db.refresh(case)
        return case
