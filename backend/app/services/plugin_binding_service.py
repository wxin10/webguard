from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.exceptions import WebGuardException
from ..core.security import (
    create_access_token,
    generate_binding_code,
    generate_plugin_challenge_id,
    generate_refresh_token,
    hash_binding_code,
    hash_refresh_token,
)
from ..models import PluginBindingChallenge, PluginInstance, PluginRefreshToken, User


ACTIVE_STATUS = "active"
PENDING_STATUS = "pending"
CONFIRMED_STATUS = "confirmed"
CONSUMED_STATUS = "consumed"
REVOKED_STATUS = "revoked"


class PluginBindingService:
    def __init__(self, db: Session):
        self.db = db

    def create_challenge(
        self,
        *,
        plugin_instance_id: str,
        plugin_version: str | None = None,
        verification_base_url: str | None = None,
    ) -> tuple[PluginBindingChallenge, str, str]:
        clean_instance_id = self._clean_plugin_instance_id(plugin_instance_id)
        challenge_id = generate_plugin_challenge_id()
        binding_code = generate_binding_code()
        challenge = PluginBindingChallenge(
            challenge_id=challenge_id,
            plugin_instance_id=clean_instance_id,
            binding_code_hash=hash_binding_code(challenge_id, binding_code),
            status=PENDING_STATUS,
            expires_at=self._now() + timedelta(seconds=settings.plugin_binding_challenge_expires_seconds),
            metadata_json={"plugin_version": plugin_version} if plugin_version else {},
        )
        self.db.add(challenge)
        self.db.flush()
        base_url = (verification_base_url or "http://127.0.0.1:5173").rstrip("/")
        verification_url = f"{base_url}/app/plugin-bind?challenge_id={challenge.challenge_id}"
        return challenge, binding_code, verification_url

    def get_challenge(self, challenge_id: str) -> PluginBindingChallenge:
        challenge = self.db.query(PluginBindingChallenge).filter(PluginBindingChallenge.challenge_id == challenge_id).first()
        if not challenge:
            raise WebGuardException(status_code=404, detail="binding challenge not found", code=40401)
        if self._is_expired(challenge):
            challenge.status = "expired"
            self.db.flush()
            raise WebGuardException(status_code=422, detail="binding challenge expired", code=42201)
        return challenge

    def confirm_challenge(
        self,
        *,
        challenge_id: str,
        binding_code: str,
        username: str,
        display_name: str | None = None,
    ) -> PluginBindingChallenge:
        challenge = self.get_challenge(challenge_id)
        if challenge.status != PENDING_STATUS:
            raise WebGuardException(status_code=409, detail="binding challenge is not pending", code=40901)
        if not self._binding_code_matches(challenge, binding_code):
            raise WebGuardException(status_code=403, detail="binding code invalid", code=40301)
        user = self._require_user(username)
        instance = self.db.query(PluginInstance).filter(
            PluginInstance.plugin_instance_id == challenge.plugin_instance_id
        ).first()
        if instance and instance.user_id != user.id and instance.status == ACTIVE_STATUS:
            raise WebGuardException(status_code=409, detail="plugin instance is bound to another user", code=40901)

        now = self._now()
        challenge.confirmed_by_user_id = user.id
        challenge.confirmed_at = now
        challenge.status = CONFIRMED_STATUS
        challenge.metadata_json = {
            **(challenge.metadata_json or {}),
            "display_name": display_name,
        }
        self.db.flush()
        return challenge

    def exchange_token(
        self,
        *,
        challenge_id: str,
        binding_code: str,
        plugin_instance_id: str,
        plugin_version: str | None = None,
    ) -> tuple[PluginInstance, str, str]:
        challenge = self.get_challenge(challenge_id)
        clean_instance_id = self._clean_plugin_instance_id(plugin_instance_id)
        if challenge.plugin_instance_id != clean_instance_id:
            raise WebGuardException(status_code=403, detail="plugin instance mismatch", code=40301)
        if challenge.status != CONFIRMED_STATUS or not challenge.confirmed_by_user_id:
            raise WebGuardException(status_code=409, detail="binding challenge is not confirmed", code=40901)
        if not self._binding_code_matches(challenge, binding_code):
            raise WebGuardException(status_code=403, detail="binding code invalid", code=40301)

        user = self.db.query(User).filter(User.id == challenge.confirmed_by_user_id).first()
        if not user or not user.is_active:
            raise WebGuardException(status_code=401, detail="user inactive", code=40101)

        now = self._now()
        instance = self.db.query(PluginInstance).filter(PluginInstance.plugin_instance_id == clean_instance_id).first()
        display_name = (challenge.metadata_json or {}).get("display_name") or clean_instance_id
        if not instance:
            instance = PluginInstance(
                plugin_instance_id=clean_instance_id,
                user_id=user.id,
                display_name=display_name,
                status=ACTIVE_STATUS,
                bound_at=now,
            )
            self.db.add(instance)
        else:
            instance.user_id = user.id
            instance.display_name = display_name
            instance.status = ACTIVE_STATUS
            instance.revoked_at = None
            instance.bound_at = instance.bound_at or now
        instance.plugin_version = plugin_version or (challenge.metadata_json or {}).get("plugin_version")
        instance.last_seen_at = now

        challenge.status = CONSUMED_STATUS
        challenge.consumed_at = now
        access_token = self._access_token(user, instance)
        raw_refresh_token = self._create_refresh_token(user, instance)
        self.db.flush()
        return instance, access_token, raw_refresh_token

    def refresh_plugin_token(self, *, raw_refresh_token: str | None, plugin_instance_id: str) -> tuple[PluginInstance, str, str]:
        clean_instance_id = self._clean_plugin_instance_id(plugin_instance_id)
        session = self._active_refresh_session(raw_refresh_token, clean_instance_id)
        if not session:
            raise WebGuardException(status_code=401, detail="plugin refresh token invalid or expired", code=40101)
        instance = self.get_active_instance(clean_instance_id)
        user = self.db.query(User).filter(User.id == session.user_id).first()
        if not user or not user.is_active or instance.user_id != user.id:
            self._revoke_refresh_session(session)
            raise WebGuardException(status_code=401, detail="plugin refresh token invalid or expired", code=40101)
        now = self._now()
        session.revoked_at = now
        session.last_used_at = now
        access_token = self._access_token(user, instance)
        raw_refresh_token_next = self._create_refresh_token(user, instance, rotated_from=session)
        instance.last_seen_at = now
        self.db.flush()
        return instance, access_token, raw_refresh_token_next

    def list_instances_for_user(self, username: str) -> list[PluginInstance]:
        user = self._require_user(username)
        return (
            self.db.query(PluginInstance)
            .filter(PluginInstance.user_id == user.id)
            .order_by(PluginInstance.created_at.desc())
            .all()
        )

    def revoke_instance(self, *, username: str, plugin_instance_id: str) -> PluginInstance:
        user = self._require_user(username)
        instance = self.db.query(PluginInstance).filter(PluginInstance.plugin_instance_id == plugin_instance_id).first()
        if not instance or instance.user_id != user.id:
            raise WebGuardException(status_code=404, detail="plugin instance not found", code=40401)
        self._revoke_instance(instance)
        return instance

    def unbind_instance(self, *, plugin_instance_id: str, username: str | None = None) -> PluginInstance:
        instance = self.get_active_instance(plugin_instance_id)
        if username:
            user = self._require_user(username)
            if instance.user_id != user.id:
                raise WebGuardException(status_code=403, detail="permission denied", code=40301)
        self._revoke_instance(instance)
        return instance

    def get_active_instance(self, plugin_instance_id: str) -> PluginInstance:
        clean_instance_id = self._clean_plugin_instance_id(plugin_instance_id)
        instance = self.db.query(PluginInstance).filter(PluginInstance.plugin_instance_id == clean_instance_id).first()
        if not instance or instance.status != ACTIVE_STATUS or instance.revoked_at is not None:
            raise WebGuardException(status_code=403, detail="plugin instance revoked or inactive", code=40301)
        return instance

    def _revoke_instance(self, instance: PluginInstance) -> None:
        now = self._now()
        instance.status = REVOKED_STATUS
        instance.revoked_at = now
        tokens = self.db.query(PluginRefreshToken).filter(
            PluginRefreshToken.plugin_instance_id == instance.plugin_instance_id,
            PluginRefreshToken.revoked_at.is_(None),
        ).all()
        for token in tokens:
            token.revoked_at = now
            token.last_used_at = now
        self.db.flush()

    def _create_refresh_token(
        self,
        user: User,
        instance: PluginInstance,
        rotated_from: PluginRefreshToken | None = None,
    ) -> str:
        raw_token = generate_refresh_token()
        session = PluginRefreshToken(
            plugin_instance_id=instance.plugin_instance_id,
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=self._now() + timedelta(seconds=settings.plugin_refresh_token_expires_seconds),
            rotated_from_id=rotated_from.id if rotated_from else None,
        )
        self.db.add(session)
        return raw_token

    def _active_refresh_session(self, raw_token: str | None, plugin_instance_id: str) -> PluginRefreshToken | None:
        if not raw_token:
            return None
        token_hash = hash_refresh_token(raw_token)
        session = self.db.query(PluginRefreshToken).filter(
            PluginRefreshToken.token_hash == token_hash,
            PluginRefreshToken.plugin_instance_id == plugin_instance_id,
        ).first()
        if not session:
            return None
        expires_at = session.expires_at if session.expires_at.tzinfo else session.expires_at.replace(tzinfo=timezone.utc)
        if session.revoked_at is not None or expires_at <= self._now():
            return None
        return session

    def _revoke_refresh_session(self, session: PluginRefreshToken) -> None:
        if session.revoked_at is None:
            session.revoked_at = self._now()
        session.last_used_at = self._now()
        self.db.flush()

    def _access_token(self, user: User, instance: PluginInstance) -> str:
        return create_access_token(
            subject=user.username,
            role=user.role,
            extra_claims={
                "token_scope": "plugin",
                "plugin_instance_id": instance.plugin_instance_id,
            },
        )

    def _require_user(self, username: str) -> User:
        user = self.db.query(User).filter(User.username == username).first()
        if not user or not user.is_active:
            raise WebGuardException(status_code=401, detail="user inactive", code=40101)
        return user

    def _binding_code_matches(self, challenge: PluginBindingChallenge, binding_code: str) -> bool:
        expected_hash = hash_binding_code(challenge.challenge_id, binding_code.strip())
        return hmac.compare_digest(challenge.binding_code_hash, expected_hash)

    def _is_expired(self, challenge: PluginBindingChallenge) -> bool:
        expires_at = challenge.expires_at if challenge.expires_at.tzinfo else challenge.expires_at.replace(tzinfo=timezone.utc)
        return expires_at <= self._now()

    @staticmethod
    def _clean_plugin_instance_id(plugin_instance_id: str) -> str:
        clean_instance_id = (plugin_instance_id or "").strip()
        if not clean_instance_id:
            raise WebGuardException(status_code=400, detail="plugin instance id is required", code=40002)
        if len(clean_instance_id) > 128:
            raise WebGuardException(status_code=400, detail="plugin instance id is too long", code=40002)
        return clean_instance_id

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)
