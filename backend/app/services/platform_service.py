from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import DomainListItem, FeedbackCase, PluginSyncEvent, Report, ScanRecord, User, UserPolicy
from ..schemas import FeedbackCaseCreate, PluginDefaultConfig, PluginPolicyBundle, PluginSyncEventCreate
from .domain_service import DomainService, normalize_domain
from .feedback_service import FeedbackService
from .plugin_event_service import PluginEventService
from .policy_service import PolicyService
from .report_service import ReportService
from .stats_service import StatsService
from .user_service import UserService


class PlatformService:
    """Compatibility facade for the website-led platform services.

    New code should prefer the focused services directly. This facade remains
    so existing routers and frontend calls keep working while the backend moves
    from a scan-interface collection to a unified platform middle layer.
    """

    def __init__(self, db: Session):
        self.db = db
        self.users = UserService(db)
        self.policies = PolicyService(db)
        self.domains = DomainService(db)
        self.reports = ReportService(db)
        self.plugin_events = PluginEventService(db)
        self.feedback = FeedbackService(db)
        self.stats = StatsService(db)

    def get_or_create_user(self, username: str, role: str = "user", email: str | None = None) -> User:
        return self.users.get_or_create_user(username, role, email)

    def get_or_create_policy(self, username: str) -> UserPolicy:
        return self.policies.get_or_create_policy(username)

    def update_policy(self, username: str, patch: dict[str, Any]) -> UserPolicy:
        return self.policies.update_policy(username, patch)

    def plugin_defaults(self) -> PluginDefaultConfig:
        return self.policies.plugin_defaults()

    def update_plugin_defaults(self, patch: dict[str, Any]) -> PluginDefaultConfig:
        return self.policies.update_plugin_defaults(patch)

    def rule_version(self) -> str:
        return self.policies.rule_version()

    def plugin_policy(self, username: str) -> PluginPolicyBundle:
        return self.policies.plugin_policy(username)

    def plugin_bootstrap(self, username: str) -> dict[str, Any]:
        return self.policies.plugin_bootstrap(username)

    def list_domains(self, owner_type: str, username: str | None = None, list_type: str | None = None) -> list[DomainListItem]:
        return self.domains.list_domains(owner_type, username=username, list_type=list_type)

    def create_domain(self, *, owner_type: str, username: str | None, data: dict[str, Any]) -> DomainListItem:
        return self.domains.create_domain(owner_type=owner_type, username=username, data=data)

    def update_domain(self, item_id: int, *, owner_type: str, username: str | None, data: dict[str, Any]) -> DomainListItem | None:
        return self.domains.update_domain(item_id, owner_type=owner_type, username=username, data=data)

    def delete_domain(self, item_id: int, *, owner_type: str, username: str | None = None) -> bool:
        return self.domains.delete_domain(item_id, owner_type=owner_type, username=username)

    def ensure_report_for_record(self, record: ScanRecord) -> Report:
        return self.reports.ensure_report_for_record(record)

    def record_for_report_id(self, report_id: int) -> ScanRecord | None:
        return self.reports.record_for_report_id(report_id)

    def record_plugin_event(self, username: str, request: PluginSyncEventCreate) -> PluginSyncEvent:
        return self.plugin_events.record_event(username, request)

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
        return self.plugin_events.list_events(
            username=username,
            role=role,
            page=page,
            page_size=page_size,
            event_type=event_type,
            risk_label=risk_label,
            scan_record_id=scan_record_id,
        )

    def plugin_stats(self, username: str, role: str) -> dict[str, int]:
        return self.plugin_events.stats(username, role)

    def create_feedback_case(self, username: str, request: FeedbackCaseCreate) -> FeedbackCase:
        return self.feedback.create_case(username, request, report_service=self.reports)

    def list_feedback_cases(
        self,
        *,
        username: str,
        role: str,
        page: int,
        page_size: int,
        status: str | None = None,
    ) -> tuple[int, list[FeedbackCase]]:
        return self.feedback.list_cases(
            username=username,
            role=role,
            page=page,
            page_size=page_size,
            status=status,
        )

    def update_feedback_case(self, case_id: int, status: str, comment: str | None = None) -> FeedbackCase | None:
        return self.feedback.update_case(case_id, status, comment)

    def source_distribution(self) -> dict[str, int]:
        return self.stats.get_source_distribution()

    def feedback_trend(self, days: int = 7) -> list[dict[str, Any]]:
        return self.stats.get_feedback_trend(days)

    def platform_overview(self) -> dict[str, Any]:
        return self.stats.get_platform_overview()
