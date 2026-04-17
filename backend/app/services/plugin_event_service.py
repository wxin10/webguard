from __future__ import annotations

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models import PluginSyncEvent
from ..schemas import PluginSyncEventCreate
from .domain_service import normalize_domain
from .user_service import UserService


class PluginEventService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserService(db)

    def record_event(self, username: str, request: PluginSyncEventCreate) -> PluginSyncEvent:
        user = self.users.get_or_create_user(username)
        host = normalize_domain(request.domain or request.host or request.url)
        event = PluginSyncEvent(
            user_id=user.id,
            username=username,
            event_type=request.event_type,
            action=request.action,
            url=request.url,
            host=host,
            domain=host,
            risk_level=request.risk_level or request.risk_label,
            risk_label=request.risk_label or request.risk_level,
            risk_score=request.risk_score,
            summary=request.summary,
            scan_record_id=request.scan_record_id,
            plugin_version=request.plugin_version or "1.0.0",
            source="plugin",
            payload=request.payload or request.metadata,
            metadata_json=request.metadata or request.payload,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_events(
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
            user = self.users.get_or_create_user(username)
            query = query.filter((PluginSyncEvent.username == username) | (PluginSyncEvent.user_id == user.id))
        if event_type:
            query = query.filter(PluginSyncEvent.event_type == event_type)
        if risk_label:
            query = query.filter((PluginSyncEvent.risk_label == risk_label) | (PluginSyncEvent.risk_level == risk_label))
        if scan_record_id:
            query = query.filter(PluginSyncEvent.scan_record_id == scan_record_id)
        total = query.count()
        events = query.order_by(desc(PluginSyncEvent.created_at)).offset((page - 1) * page_size).limit(page_size).all()
        return total, events

    def stats(self, username: str, role: str) -> dict[str, int]:
        query = self.db.query(PluginSyncEvent)
        if role != "admin":
            user = self.users.get_or_create_user(username)
            query = query.filter((PluginSyncEvent.username == username) | (PluginSyncEvent.user_id == user.id))
        events = query.all()
        return {
            "total_events": len(events),
            "scan_events": len([item for item in events if item.event_type == "scan"]),
            "warning_events": len([item for item in events if item.event_type == "warning"]),
            "bypass_events": len([item for item in events if item.event_type == "bypass"]),
            "trust_events": len([item for item in events if item.event_type in ("trust", "temporary_trust")]),
            "feedback_events": len([item for item in events if item.event_type == "feedback"]),
            "malicious_events": len([item for item in events if (item.risk_level or item.risk_label) == "malicious"]),
            "suspicious_events": len([item for item in events if (item.risk_level or item.risk_label) == "suspicious"]),
        }
