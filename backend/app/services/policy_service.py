from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import (
    DomainBlacklist,
    DomainListItem,
    DomainWhitelist,
    PlatformSetting,
    RuleConfig,
    UserPolicy,
    UserSiteStrategy,
)
from ..schemas import PluginDefaultConfig, PluginPolicyBundle
from .user_service import UserService


PLUGIN_DEFAULT_CONFIG_KEY = "plugin_default_config"


class PolicyService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserService(db)

    def get_or_create_policy(self, username: str) -> UserPolicy:
        user = self.users.get_or_create_user(username)
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
        return PluginDefaultConfig(**dict(setting.value_json))

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
            return f"rules-{total}-{self._normalize_datetime(latest).isoformat()}"
        return f"rules-{total}-initial"

    def plugin_policy(self, username: str) -> PluginPolicyBundle:
        now = datetime.now(timezone.utc)
        policy = self.get_or_create_policy(username)
        user = self.users.get_or_create_user(username)
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
        trusted_hosts = sorted(set(bundle.user_trusted_hosts + bundle.global_trusted_hosts))
        blocked_hosts = sorted(set(bundle.user_blocked_hosts + bundle.global_blocked_hosts))
        temp_bypass_records = bundle.user_paused_hosts
        policy_updated_at = self._normalize_datetime(policy.updated_at or bundle.generated_at)
        generated_at = self._normalize_datetime(bundle.generated_at)
        latest_updated_at = max(policy_updated_at, generated_at)
        return {
            "user_policy": {
                "id": policy.id,
                "user_id": policy.user_id,
                "username": policy.username,
                "auto_detect": policy.auto_detect,
                "auto_block_malicious": policy.auto_block_malicious,
                "notify_suspicious": policy.notify_suspicious,
                "bypass_duration_minutes": policy.bypass_duration_minutes,
                "plugin_enabled": policy.plugin_enabled,
                "updated_at": policy.updated_at,
            },
            "trusted_hosts": trusted_hosts,
            "blocked_hosts": blocked_hosts,
            "temp_bypass_records": temp_bypass_records,
            "whitelist_domains": {
                "user": bundle.user_trusted_hosts,
                "global": bundle.global_trusted_hosts,
                "all": trusted_hosts,
            },
            "blacklist_domains": {
                "user": bundle.user_blocked_hosts,
                "global": bundle.global_blocked_hosts,
                "all": blocked_hosts,
            },
            "temporary_trusted_domains": temp_bypass_records,
            "plugin_default_config": bundle.defaults.model_dump(),
            "policy_version": f"policy-{policy_updated_at.isoformat()}",
            "config_version": bundle.rule_version,
            "current_rule_version": bundle.rule_version,
            "updated_at": latest_updated_at,
            "generated_at": generated_at,
        }

    def _normalize_datetime(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
