from dataclasses import dataclass
from typing import Any

from fastapi import Header
from fastapi.responses import JSONResponse

from .response import error_response, success_payload


@dataclass(frozen=True)
class Principal:
    username: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def principal_from_headers(
    x_webguard_user: str | None = Header(default=None),
    x_webguard_role: str | None = Header(default=None),
) -> Principal:
    """Development auth boundary.

    Today the frontend sends development headers from mock-login. Keeping this
    in one dependency makes it straightforward to replace with JWT/session auth
    without changing services or business routes.
    """

    username = (x_webguard_user or "platform-user").strip() or "platform-user"
    role = (x_webguard_role or "user").strip() or "user"
    return Principal(username=username, role=role)


def ok(data: Any = None, message: str = "success") -> dict[str, Any]:
    return success_payload(data=data, message=message)


def fail(message: str, status_code: int = 400, data: Any = None, code: int | None = None) -> JSONResponse:
    return error_response(message=message, status_code=status_code, code=code, data=data)


def require_admin(principal: Principal) -> JSONResponse | None:
    if principal.is_admin:
        return None
    return fail("admin permission required", 403)
