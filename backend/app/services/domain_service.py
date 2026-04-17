from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models import DomainBlacklist, DomainListItem, DomainWhitelist, UserSiteStrategy
from .user_service import UserService


def normalize_domain(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip().lower()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.hostname or raw).replace("www.", "", 1)


class DomainService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserService(db)

    def list_domains(
        self,
        owner_type: str,
        username: str | None = None,
        list_type: str | None = None,
    ) -> list[DomainListItem]:
        query = self.db.query(DomainListItem).filter(DomainListItem.owner_type == owner_type)
        if owner_type == "user":
            user = self.users.get_or_create_user(username or "platform-user")
            query = query.filter(DomainListItem.owner_id == user.id)
        if list_type:
            query = query.filter(DomainListItem.list_type == list_type)
        return query.order_by(desc(DomainListItem.updated_at)).all()

    def create_domain(self, *, owner_type: str, username: str | None, data: dict[str, Any]) -> DomainListItem:
        user = self.users.get_or_create_user(username or "platform-user") if owner_type == "user" else None
        host = normalize_domain(data.get("host") or data.get("domain") or data.get("url"))
        list_type = data.get("list_type") or "trusted"
        expires_at = self._resolve_expires_at(list_type, data)
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
        self._sync_compatibility_tables(item, username=user.username if user else None)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update_domain(
        self,
        item_id: int,
        *,
        owner_type: str,
        username: str | None,
        data: dict[str, Any],
    ) -> DomainListItem | None:
        query = self.db.query(DomainListItem).filter(
            DomainListItem.id == item_id,
            DomainListItem.owner_type == owner_type,
        )
        user = None
        if owner_type == "user":
            user = self.users.get_or_create_user(username or "platform-user")
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
            item.expires_at = self._parse_datetime(data["expires_at"])

        self._sync_compatibility_tables(item, username=user.username if user else None)
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete_domain(self, item_id: int, *, owner_type: str, username: str | None = None) -> bool:
        item = self.update_domain(item_id, owner_type=owner_type, username=username, data={"status": "disabled"})
        return bool(item)

    def _resolve_expires_at(self, list_type: str, data: dict[str, Any]) -> datetime | None:
        explicit = data.get("expires_at")
        if explicit:
            return self._parse_datetime(explicit)
        if list_type == "temp_bypass":
            minutes = int(data.get("minutes") or 30)
            return datetime.now(timezone.utc) + timedelta(minutes=minutes)
        return None

    def _parse_datetime(self, value: Any) -> datetime | None:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str) and value.strip():
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return None

    def _sync_compatibility_tables(self, item: DomainListItem, username: str | None) -> None:
        if item.owner_type == "user" and username:
            self._sync_user_strategy(username, item)
        if item.owner_type == "global" and item.list_type in ("trusted", "blocked"):
            self._sync_global_domain(item)

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
            payload = {
                "domain": item.host,
                "reason": item.reason,
                "source": item.source,
                "status": item.status,
            }
            if item.list_type == "blocked":
                payload["risk_type"] = "platform_policy"
            self.db.add(model(**payload))
