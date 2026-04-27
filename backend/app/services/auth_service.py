from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import (
    create_access_token,
    generate_refresh_token,
    generate_session_id,
    hash_refresh_token,
    verify_password,
)
from ..models import RefreshToken, User


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def authenticate_user(self, username_or_email: str, password: str) -> User | None:
        account = (username_or_email or "").strip()
        if not account or not password:
            return None
        user = (
            self.db.query(User)
            .filter((User.username == account) | (User.email == account))
            .first()
        )
        if not user or not user.is_active or not verify_password(password, user.password_hash):
            return None
        return user

    def create_web_session(
        self,
        user: User,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
        rotated_from: RefreshToken | None = None,
    ) -> tuple[str, RefreshToken]:
        raw_token = generate_refresh_token()
        session = RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            session_id=generate_session_id(),
            user_agent=(user_agent or "")[:255] or None,
            ip_address=(ip_address or "")[:45] or None,
            expires_at=self._expires_at(),
            rotated_from_id=rotated_from.id if rotated_from else None,
        )
        self.db.add(session)
        self.db.flush()
        return raw_token, session

    def rotate_refresh_token(
        self,
        raw_token: str | None,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[User, str, RefreshToken] | None:
        session = self._active_session_for_raw_token(raw_token)
        if not session:
            return None
        user = self.db.query(User).filter(User.id == session.user_id).first()
        if not user or not user.is_active:
            self.revoke_session(session)
            return None
        now = self._now()
        session.revoked_at = now
        session.last_used_at = now
        raw_token_next, session_next = self.create_web_session(
            user,
            user_agent=user_agent,
            ip_address=ip_address,
            rotated_from=session,
        )
        return user, raw_token_next, session_next

    def revoke_raw_refresh_token(self, raw_token: str | None) -> bool:
        session = self._session_for_raw_token(raw_token)
        if not session:
            return False
        self.revoke_session(session)
        return True

    def revoke_session(self, session: RefreshToken) -> None:
        if not session.revoked_at:
            session.revoked_at = self._now()
        session.last_used_at = self._now()
        self.db.flush()

    def access_token_for_user(self, user: User, session: RefreshToken | None = None) -> str:
        extra_claims = {"session_id": session.session_id} if session else None
        return create_access_token(subject=user.username, role=user.role, extra_claims=extra_claims)

    def _active_session_for_raw_token(self, raw_token: str | None) -> RefreshToken | None:
        session = self._session_for_raw_token(raw_token)
        if not session:
            return None
        now = self._now()
        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if session.revoked_at is not None or expires_at <= now:
            return None
        return session

    def _session_for_raw_token(self, raw_token: str | None) -> RefreshToken | None:
        if not raw_token:
            return None
        token_hash = hash_refresh_token(raw_token)
        return self.db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    def _expires_at(self) -> datetime:
        return self._now() + timedelta(seconds=settings.refresh_token_expires_seconds)

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)
