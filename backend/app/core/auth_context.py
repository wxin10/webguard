from dataclasses import dataclass
from typing import Any

from fastapi import Header


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
    return {"success": True, "code": 0, "message": message, "data": data}


def fail(message: str, code: int = 400, data: Any = None) -> dict[str, Any]:
    return {"success": False, "code": code, "message": message, "data": data}


def require_admin(principal: Principal) -> dict[str, Any] | None:
    if principal.is_admin:
        return None
    return fail("admin permission required", 403)
