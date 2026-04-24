from dataclasses import dataclass
from typing import Any

from fastapi import Header
from fastapi.responses import JSONResponse

from .config import settings
from .exceptions import WebGuardException
from .response import error_response, success_payload
from .security import TokenError, decode_access_token


@dataclass(frozen=True)
class Principal:
    username: str
    role: str
    auth_mode: str = "anonymous"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_authenticated(self) -> bool:
        return self.auth_mode != "anonymous"


def _token_from_authorization_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _principal_from_token(authorization: str | None) -> Principal | None:
    token = _token_from_authorization_header(authorization)
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        detail = str(exc)
        code = 40102 if detail == "token expired" else 40101
        raise WebGuardException(status_code=401, detail=detail, code=code) from exc
    return Principal(
        username=payload["sub"].strip(),
        role=payload["role"].strip(),
        auth_mode="token",
    )


def _principal_from_dev_headers(x_webguard_user: str | None, x_webguard_role: str | None) -> Principal | None:
    if not settings.dev_auth_enabled:
        return None
    if not x_webguard_user and not x_webguard_role:
        return None
    username = (x_webguard_user or "platform-user").strip() or "platform-user"
    role = (x_webguard_role or "user").strip() or "user"
    return Principal(username=username, role=role, auth_mode="dev-header")


def _anonymous_principal() -> Principal:
    return Principal(username="anonymous", role="user", auth_mode="anonymous")


def principal_from_headers(
    authorization: str | None = Header(default=None),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
) -> Principal:
    """Compatibility auth boundary for routes not yet frozen behind require_auth.

    Prefer a real Bearer token when present. Legacy development headers remain
    available only in development mode. Existing low-risk routes may still
    resolve to an anonymous principal until they are migrated to require_auth.
    """

    token_principal = _principal_from_token(authorization)
    if token_principal:
        return token_principal
    dev_principal = _principal_from_dev_headers(x_webguard_user, x_webguard_role)
    if dev_principal:
        return dev_principal
    if settings.dev_auth_enabled:
        return Principal(username="platform-user", role="user", auth_mode="dev-default")
    return _anonymous_principal()


def get_current_user(
    authorization: str | None = Header(default=None),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
) -> Principal:
    token_principal = _principal_from_token(authorization)
    if token_principal:
        return token_principal
    dev_principal = _principal_from_dev_headers(x_webguard_user, x_webguard_role)
    if dev_principal:
        return dev_principal
    raise WebGuardException(status_code=401, detail="authentication required", code=40101)


def require_auth(
    authorization: str | None = Header(default=None),
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
) -> Principal:
    return get_current_user(
        authorization=authorization,
        x_webguard_user=x_webguard_user,
        x_webguard_role=x_webguard_role,
    )


def ok(data: Any = None, message: str = "success") -> dict[str, Any]:
    return success_payload(data=data, message=message)


def fail(message: str, status_code: int = 400, data: Any = None, code: int | None = None) -> JSONResponse:
    return error_response(message=message, status_code=status_code, code=code, data=data)


def require_admin(principal: Principal) -> JSONResponse | None:
    if principal.is_admin:
        return None
    return fail("admin permission required", 403)
