from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..models import (
    DomainBlacklist,
    DomainListItem,
    DomainWhitelist,
    FeedbackCase,
    PlatformSetting,
    PluginSyncEvent,
    Report,
    RuleConfig,
    ScanRecord,
    User,
    UserPolicy,
    UserSiteStrategy,
)
from ..schemas import FeedbackCaseCreate, PluginDefaultConfig, PluginPolicyBundle, PluginSyncEventCreate


PLUGIN_DEFAULT_CONFIG_KEY = "plugin_default_config"


def normalize_domain(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip().lower()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.hostname or raw).replace("www.", "", 1)


class PlatformService:
    """Website-led service for users, policy, reports, plugin sync, and feedback."""

    def __init__(self, db: Session):
        self.db = db

    def get_or_create_user(self, username: str, role: str = "user", email: str | None = None) -> User:
        clean_username = (username or "platform-user").strip() or "platform-user"
        user = self.db.query(User).filter(User.username == clean_username).first()
        if user:
            if email and not user.email:
                user.email = email
            if role and user.role != role and clean_username != "platform-user":
                user.role = role
            self.db.flush()
            return user
        user = User(username=clean_username, email=email, display_name=clean_username, role=role or "user")
        self.db.add(user)
        self.db.flush()
        return user

    def get_or_create_policy(self, username: str) -> UserPolicy:
        user = self.get_or_create_user(username)
        policy = self.db.query(UserPolicy).filter(UserPolicy.user_id == user.id).first()
        if policy:
            return policy
        policy = UserPolicy(
            user_id=user.id,
            username=user.username,
            auto_detect=True,
            auto_block_malicious=True,
            notify_suspicious=True,
            bypass_duration_minutes=30,
            plugin_enabled=True,
        )
        self.db.add(policy)
        self.db.commit()
        self.db.refresh(policy)
        return policy

    def update_policy(self, username: str, patch: dict[str, Any]) -> UserPolicy:
        policy = self.get_or_create_policy(username)
        for key in [
            "auto_detect",
            "auto_block_malicious",
            "notify_suspicious",
            "bypass_duration_minutes",
            "plugin_enabled",
        ]:
            if key in patch and patch[key] is not None:
                setattr(policy, key, patch[key])
        self.db.commit()
        self.db.refresh(policy)
        return policy

    def plugin_defaults(self) -> PluginDefaultConfig:
        setting = self.db.query(PlatformSetting).filter(PlatformSetting.key == PLUGIN_DEFAULT_CONFIG_KEY).first()
        if not setting or not setting.value_json:
            return PluginDefaultConfig()
        data = dict(setting.value_json)
        return PluginDefaultConfig(**data)

    def update_plugin_defaults(self, patch: dict[str, Any]) -> PluginDefaultConfig:
        current = self.plugin_defaults().model_dump()
        current.update({key: value for key, value in patch.items() if value is not None})
        setting = self.db.query(PlatformSetting).filter(PlatformSetting.key == PLUGIN_DEFAULT_CONFIG_KEY).first()
        if setting:
            setting.value_json = current
        else:
            setting = PlatformSetting(key=PLUGIN_DEFAULT_CONFIG_KEY, value_json=current)
            self.db.add(setting)
        self.db.commit()
        return PluginDefaultConfig(**current)

    def rule_version(self) -> str:
        total = self.db.query(func.count(RuleConfig.id)).scalar() or 0
        latest = self.db.query(func.max(RuleConfig.updated_at)).scalar()
        if latest:
            return f"rules-{total}-{latest.isoformat()}"
        return f"rules-{total}-initial"

    def ensure_report_for_record(self, record: ScanRecord) -> Report:
        report = self.db.query(Report).filter(Report.scan_record_id == record.id).first()
        if report:
            if not record.report_id:
                record.report_id = report.id
                self.db.commit()
            return report
        report = Report(
            scan_record_id=record.id,
            user_id=record.user_id,
            url=record.url,
            host=record.domain,
            risk_level=record.label,
            risk_score=record.risk_score,
            summary=record.explanation,
            reasons=record.hit_rules_json or [],
            matched_rules=[rule for rule in (record.hit_rules_json or []) if rule.get("matched")],
            page_signals=record.raw_features_json or {},
            recommendation=record.recommendation,
        )
        self.db.add(report)
        self.db.flush()
        record.report_id = report.id
        self.db.commit()
        self.db.refresh(report)
        return report

    def record_for_report_id(self, report_id: int) -> ScanRecord | None:
        report = self.db.query(Report).filter(Report.id == report_id).first()
        if report:
            return self.db.query(ScanRecord).filter(ScanRecord.id == report.scan_record_id).first()
        record = self.db.query(ScanRecord).filter(ScanRecord.id == report_id).first()
        if record:
            self.ensure_report_for_record(record)
        return record

    def _sync_user_strategy(self, username: str, item: DomainListItem) -> None:
        strategy_type = "paused" if item.list_type == "temp_bypass" else item.list_type
        existing = self.db.query(UserSiteStrategy).filter(
            UserSiteStrategy.username == username,
            UserSiteStrategy.domain == item.host,
            UserSiteStrategy.strategy_type == strategy_type,
        ).first()
        if item.status != "active":
            if existing:
                existing.is_active = False
            return
        if existing:
            existing.reason = item.reason
            existing.source = item.source
            existing.expires_at = item.expires_at
            existing.is_active = True
        else:
            self.db.add(
                UserSiteStrategy(
                    username=username,
                    domain=item.host,
                    strategy_type=strategy_type,
                    reason=item.reason,
                    source=item.source,
                    expires_at=item.expires_at,
                    is_active=True,
                )
            )

    def _sync_global_domain(self, item: DomainListItem) -> None:
        model = DomainWhitelist if item.list_type == "trusted" else DomainBlacklist
        existing = self.db.query(model).filter(model.domain == item.host).first()
        if existing:
            existing.reason = item.reason
            existing.source = item.source
            existing.status = item.status
            if hasattr(existing, "risk_type") and item.list_type == "blocked":
                existing.risk_type = "platform_policy"
        else:
            kwargs = {"domain": item.host, "reason": item.reason, "source": item.source, "status": item.status}
            if item.list_type == "blocked":
                kwargs["risk_type"] = "platform_policy"
            self.db.add(model(**kwargs))

    def list_domains(self, owner_type: str, username: str | None = None, list_type: str | None = None) -> list[DomainListItem]:
        query = self.db.query(DomainListItem).filter(DomainListItem.owner_type == owner_type)
        if owner_type == "user":
            user = self.get_or_create_user(username or "platform-user")
            query = query.filter(DomainListItem.owner_id == user.id)
        if list_type:
            query = query.filter(DomainListItem.list_type == list_type)
        return query.order_by(desc(DomainListItem.updated_at)).all()

    def create_domain(self, *, owner_type: str, username: str | None, data: dict[str, Any]) -> DomainListItem:
        user = self.get_or_create_user(username or "platform-user") if owner_type == "user" else None
        host = normalize_domain(data.get("host") or data.get("domain") or data.get("url"))
        list_type = data.get("list_type") or "trusted"
        expires_at = data.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if list_type == "temp_bypass" and not expires_at:
            minutes = int(data.get("minutes") or 30)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes)
        item = DomainListItem(
            owner_type=owner_type,
            owner_id=user.id if user else None,
            host=host,
            list_type=list_type,
            source=data.get("source") or "manual",
            status=data.get("status") or "active",
            reason=data.get("reason"),
            expires_at=expires_at,
        )
        self.db.add(item)
        self.db.flush()
        if owner_type == "user" and user:
            self._sync_user_strategy(user.username, item)
        if owner_type == "global" and list_type in ("trusted", "blocked"):
            self._sync_global_domain(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update_domain(self, item_id: int, *, owner_type: str, username: str | None, data: dict[str, Any]) -> DomainListItem | None:
        query = self.db.query(DomainListItem).filter(DomainListItem.id == item_id, DomainListItem.owner_type == owner_type)
        user = None
        if owner_type == "user":
            user = self.get_or_create_user(username or "platform-user")
            query = query.filter(DomainListItem.owner_id == user.id)
        item = query.first()
        if not item:
            return None
        for key in ["list_type", "source", "status", "reason"]:
            if key in data and data[key] is not None:
                setattr(item, key, data[key])
        if data.get("host") or data.get("domain"):
            item.host = normalize_domain(data.get("host") or data.get("domain"))
        if "expires_at" in data:
            value = data["expires_at"]
            item.expires_at = datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value
        if owner_type == "user" and user:
            self._sync_user_strategy(user.username, item)
        if owner_type == "global" and item.list_type in ("trusted", "blocked"):
            self._sync_global_domain(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete_domain(self, item_id: int, *, owner_type: str, username: str | None = None) -> bool:
        item = self.update_domain(item_id, owner_type=owner_type, username=username, data={"status": "disabled"})
        return bool(item)

    def plugin_policy(self, username: str) -> PluginPolicyBundle:
        now = datetime.now(timezone.utc)
        policy = self.get_or_create_policy(username)
        user = self.get_or_create_user(username)
        user_items = self.db.query(DomainListItem).filter(
            DomainListItem.owner_type == "user",
            DomainListItem.owner_id == user.id,
            DomainListItem.status == "active",
        ).filter(
            (DomainListItem.expires_at.is_(None)) | (DomainListItem.expires_at > now)
        ).all()
        legacy_strategies = self.db.query(UserSiteStrategy).filter(
            UserSiteStrategy.username == username,
            UserSiteStrategy.is_active.is_(True),
        ).filter(
            (UserSiteStrategy.expires_at.is_(None)) | (UserSiteStrategy.expires_at > now)
        ).all()
        global_items = self.db.query(DomainListItem).filter(
            DomainListItem.owner_type == "global",
            DomainListItem.status == "active",
        ).all()
        defaults = self.plugin_defaults()
        defaults.auto_detect = bool(policy.auto_detect)
        defaults.auto_block_malicious = bool(policy.auto_block_malicious)
        defaults.notify_suspicious = bool(policy.notify_suspicious)
        return PluginPolicyBundle(
            username=username,
            rule_version=self.rule_version(),
            defaults=defaults,
            user_trusted_hosts=sorted(
                {item.host for item in user_items if item.list_type == "trusted"}
                | {item.domain for item in legacy_strategies if item.strategy_type == "trusted"}
            ),
            user_blocked_hosts=sorted(
                {item.host for item in user_items if item.list_type == "blocked"}
                | {item.domain for item in legacy_strategies if item.strategy_type == "blocked"}
            ),
            user_paused_hosts=[
                {
                    "domain": item.host,
                    "expires_at": item.expires_at.isoformat() if item.expires_at else None,
                    "reason": item.reason,
                }
                for item in user_items
                if item.list_type == "temp_bypass"
            ]
            + [
                {
                    "domain": item.domain,
                    "expires_at": item.expires_at.isoformat() if item.expires_at else None,
                    "reason": item.reason,
                }
                for item in legacy_strategies
                if item.strategy_type == "paused"
            ],
            global_trusted_hosts=sorted(
                {item.host for item in global_items if item.list_type == "trusted"}
                | {item.domain for item in self.db.query(DomainWhitelist).filter(DomainWhitelist.status == "active").all()}
            ),
            global_blocked_hosts=sorted(
                {item.host for item in global_items if item.list_type == "blocked"}
                | {item.domain for item in self.db.query(DomainBlacklist).filter(DomainBlacklist.status == "active").all()}
            ),
            generated_at=now,
        )

    def plugin_bootstrap(self, username: str) -> dict[str, Any]:
        policy = self.get_or_create_policy(username)
        bundle = self.plugin_policy(username)
        return {
            "user_policy": {
                "id": policy.id,
                "user_id": policy.user_id,
                "auto_detect": policy.auto_detect,
                "auto_block_malicious": policy.auto_block_malicious,
                "notify_suspicious": policy.notify_suspicious,
                "bypass_duration_minutes": policy.bypass_duration_minutes,
                "plugin_enabled": policy.plugin_enabled,
                "updated_at": policy.updated_at,
            },
            "trusted_hosts": bundle.user_trusted_hosts + bundle.global_trusted_hosts,
            "blocked_hosts": bundle.user_blocked_hosts + bundle.global_blocked_hosts,
            "temp_bypass_records": bundle.user_paused_hosts,
            "plugin_default_config": bundle.defaults.model_dump(),
            "current_rule_version": bundle.rule_version,
            "generated_at": bundle.generated_at,
        }

    def record_plugin_event(self, username: str, request: PluginSyncEventCreate) -> PluginSyncEvent:
        user = self.get_or_create_user(username)
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
            user = self.get_or_create_user(username)
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

    def plugin_stats(self, username: str, role: str) -> dict[str, int]:
        query = self.db.query(PluginSyncEvent)
        if role != "admin":
            user = self.get_or_create_user(username)
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

    def create_feedback_case(self, username: str, request: FeedbackCaseCreate) -> FeedbackCase:
        user = self.get_or_create_user(username)
        record = None
        if request.report_id:
            record = self.record_for_report_id(request.report_id)
        url = request.url or (record.url if record else None)
        report_id = None
        scan_record_id = None
        if record:
            report = self.ensure_report_for_record(record)
            report_id = report.id
            scan_record_id = record.id
        case = FeedbackCase(
            user_id=user.id,
            username=username,
            related_report_id=report_id,
            related_event_id=request.related_event_id,
            report_id=scan_record_id or request.report_id,
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
            user = self.get_or_create_user(username)
            query = query.filter((FeedbackCase.username == username) | (FeedbackCase.user_id == user.id))
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
            case.content = case.comment
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
                FeedbackCase.status.in_(["confirmed_false_positive", "confirmed_risk", "closed", "resolved"]),
            ).scalar() or 0
            result.append({"date": current.strftime("%Y-%m-%d"), "count": total, "resolved_count": resolved})
            current += timedelta(days=1)
        return result

    def platform_overview(self) -> dict[str, Any]:
        total_scans = self.db.query(func.count(ScanRecord.id)).scalar() or 0
        high_risk = self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == "malicious").scalar() or 0
        plugin_events = self.db.query(func.count(PluginSyncEvent.id)).scalar() or 0
        warning_count = self.db.query(func.count(PluginSyncEvent.id)).filter(PluginSyncEvent.event_type == "warning").scalar() or 0
        bypass_count = self.db.query(func.count(PluginSyncEvent.id)).filter(PluginSyncEvent.event_type == "bypass").scalar() or 0
        trust_count = self.db.query(func.count(PluginSyncEvent.id)).filter(PluginSyncEvent.event_type.in_(["trust", "temporary_trust"])).scalar() or 0
        feedback_count = self.db.query(func.count(FeedbackCase.id)).scalar() or 0
        source_distribution = self.source_distribution()
        return {
            "total_scans": total_scans,
            "high_risk_count": high_risk,
            "plugin_event_count": plugin_events,
            "warning_count": warning_count,
            "bypass_count": bypass_count,
            "trust_count": trust_count,
            "feedback_count": feedback_count,
            "source_distribution": source_distribution,
        }
