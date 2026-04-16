from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..models import (
    DomainBlacklist,
    DomainWhitelist,
    FeedbackCase,
    PluginSyncEvent,
    RuleConfig,
    ScanRecord,
    UserSiteStrategy,
)
from ..schemas import FeedbackCaseCreate, PluginDefaultConfig, PluginPolicyBundle, PluginSyncEventCreate


def normalize_domain(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip().lower()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.hostname or raw).replace("www.", "", 1)


class PlatformService:
    """Service layer for website-led policy, plugin sync, and feedback flows."""

    def __init__(self, db: Session):
        self.db = db

    def rule_version(self) -> str:
        total = self.db.query(func.count(RuleConfig.id)).scalar() or 0
        latest = self.db.query(func.max(RuleConfig.updated_at)).scalar()
        if latest:
            return f"rules-{total}-{latest.isoformat()}"
        return f"rules-{total}-initial"

    def plugin_policy(self, username: str) -> PluginPolicyBundle:
        now = datetime.now(timezone.utc)
        strategies = self.db.query(UserSiteStrategy).filter(
            UserSiteStrategy.username == username,
            UserSiteStrategy.is_active.is_(True),
        ).filter(
            (UserSiteStrategy.expires_at.is_(None)) | (UserSiteStrategy.expires_at > now)
        ).all()
        return PluginPolicyBundle(
            username=username,
            rule_version=self.rule_version(),
            defaults=PluginDefaultConfig(),
            user_trusted_hosts=[item.domain for item in strategies if item.strategy_type == "trusted"],
            user_blocked_hosts=[item.domain for item in strategies if item.strategy_type == "blocked"],
            user_paused_hosts=[
                {
                    "domain": item.domain,
                    "expires_at": item.expires_at.isoformat() if item.expires_at else None,
                    "reason": item.reason,
                }
                for item in strategies
                if item.strategy_type == "paused"
            ],
            global_trusted_hosts=[
                item.domain for item in self.db.query(DomainWhitelist).filter(DomainWhitelist.status == "active").all()
            ],
            global_blocked_hosts=[
                item.domain for item in self.db.query(DomainBlacklist).filter(DomainBlacklist.status == "active").all()
            ],
            generated_at=now,
        )

    def record_plugin_event(self, username: str, request: PluginSyncEventCreate) -> PluginSyncEvent:
        event = PluginSyncEvent(
            username=username,
            event_type=request.event_type,
            action=request.action,
            url=request.url,
            domain=normalize_domain(request.domain or request.url),
            risk_label=request.risk_label,
            risk_score=request.risk_score,
            summary=request.summary,
            scan_record_id=request.scan_record_id,
            plugin_version=request.plugin_version or "1.0.0",
            source="plugin",
            metadata_json=request.metadata,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_plugin_events(
        self,
        *,
        username: str,
        role: str,
        page: int,
        page_size: int,
        event_type: str | None = None,
        risk_label: str | None = None,
        scan_record_id: int | None = None,
    ) -> tuple[int, list[PluginSyncEvent]]:
        query = self.db.query(PluginSyncEvent)
        if role != "admin":
            query = query.filter(PluginSyncEvent.username == username)
        if event_type:
            query = query.filter(PluginSyncEvent.event_type == event_type)
        if risk_label:
            query = query.filter(PluginSyncEvent.risk_label == risk_label)
        if scan_record_id:
            query = query.filter(PluginSyncEvent.scan_record_id == scan_record_id)
        total = query.count()
        events = query.order_by(desc(PluginSyncEvent.created_at)).offset((page - 1) * page_size).limit(page_size).all()
        return total, events

    def plugin_stats(self, username: str, role: str) -> dict[str, int]:
        query = self.db.query(PluginSyncEvent)
        if role != "admin":
            query = query.filter(PluginSyncEvent.username == username)
        events = query.all()
        return {
            "total_events": len(events),
            "scan_events": len([item for item in events if item.event_type == "scan"]),
            "warning_events": len([item for item in events if item.event_type == "warning"]),
            "bypass_events": len([item for item in events if item.event_type == "bypass"]),
            "trust_events": len([item for item in events if item.event_type in ("trust", "temporary_trust")]),
            "feedback_events": len([item for item in events if item.event_type == "feedback"]),
            "malicious_events": len([item for item in events if item.risk_label == "malicious"]),
            "suspicious_events": len([item for item in events if item.risk_label == "suspicious"]),
        }

    def create_feedback_case(self, username: str, request: FeedbackCaseCreate) -> FeedbackCase:
        record = None
        if request.report_id:
            record = self.db.query(ScanRecord).filter(ScanRecord.id == request.report_id).first()
        url = request.url or (record.url if record else None)
        case = FeedbackCase(
            username=username,
            report_id=request.report_id,
            url=url,
            domain=normalize_domain(url),
            feedback_type=request.feedback_type,
            status=request.status,
            comment=request.comment,
            source=request.source,
        )
        self.db.add(case)
        self.db.commit()
        self.db.refresh(case)
        return case

    def list_feedback_cases(
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
            query = query.filter(FeedbackCase.username == username)
        if status:
            query = query.filter(FeedbackCase.status == status)
        total = query.count()
        cases = query.order_by(desc(FeedbackCase.created_at)).offset((page - 1) * page_size).limit(page_size).all()
        return total, cases

    def update_feedback_case(self, case_id: int, status: str, comment: str | None = None) -> FeedbackCase | None:
        case = self.db.query(FeedbackCase).filter(FeedbackCase.id == case_id).first()
        if not case:
            return None
        case.status = status
        if comment:
            case.comment = f"{case.comment or ''}\n{comment}".strip()
        self.db.commit()
        self.db.refresh(case)
        return case

    def source_distribution(self) -> dict[str, int]:
        rows = self.db.query(ScanRecord.source, func.count(ScanRecord.id)).group_by(ScanRecord.source).all()
        return {source or "unknown": int(count) for source, count in rows}

    def feedback_trend(self, days: int = 7) -> list[dict[str, Any]]:
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days - 1)
        result = []
        current = start_date
        while current <= end_date:
            total = self.db.query(func.count(FeedbackCase.id)).filter(func.date(FeedbackCase.created_at) == current).scalar() or 0
            resolved = self.db.query(func.count(FeedbackCase.id)).filter(
                func.date(FeedbackCase.created_at) == current,
                FeedbackCase.status.in_(["confirmed_false_positive", "confirmed_risk", "closed"]),
            ).scalar() or 0
            result.append({"date": current.strftime("%Y-%m-%d"), "count": total, "resolved_count": resolved})
            current += timedelta(days=1)
        return result
