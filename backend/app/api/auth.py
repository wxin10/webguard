from fastapi import APIRouter, Cookie, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db, settings
from ..core.auth_context import Principal, ok, require_auth
from ..core.exceptions import WebGuardException
from ..core.response import success_response
from ..core.security import create_access_token
from ..models import User
from ..schemas import ApiResponse
from ..services.auth_service import AuthService
from ..services.user_service import UserService


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class MockLoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    role: str = Field("user", pattern="^(admin|user)$")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserProfileResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    role: str
    display_name: str
    is_active: bool


class MockLoginResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    role: str
    display_name: str
    is_active: bool
    access_token: str
    token_type: str = "Bearer"
    expires_in: int


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserProfileResponse | None = None


def _user_profile(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "display_name": user.display_name,
        "is_active": bool(user.is_active),
    }


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _set_refresh_cookie(response: JSONResponse, raw_token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=raw_token,
        max_age=settings.refresh_token_expires_seconds,
        httponly=True,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        samesite="lax",
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: JSONResponse) -> None:
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        path="/api/v1/auth",
        httponly=True,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        samesite="lax",
    )


@router.post("/mock-login", response_model=ApiResponse[MockLoginResponse])
def mock_login(request: MockLoginRequest, db: Session = Depends(get_db)):
    """Development-only helper for fixed demo accounts.

    This endpoint is available only when DEBUG and ENABLE_DEV_AUTH are both
    true. It never creates arbitrary users or changes roles.
    """
    if not settings.mock_login_enabled:
        raise WebGuardException(status_code=403, detail="mock login is disabled", code=40301)

    username = request.username.strip()
    if (username, request.role) not in {("admin", "admin"), ("guest", "user")}:
        raise WebGuardException(status_code=403, detail="mock login only supports admin/admin or guest/user", code=40301)

    user_service = UserService(db)
    user_service.ensure_default_users()
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active or user.role != request.role:
        raise WebGuardException(status_code=401, detail="user inactive", code=40101)

    access_token = create_access_token(subject=user.username, role=user.role)
    db.commit()
    db.refresh(user)
    return ok(
        {
            **_user_profile(user),
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expires_seconds,
        }
    )


@router.post("/login", response_model=ApiResponse[AuthTokenResponse])
def login(request_body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    auth_service = AuthService(db)
    UserService(db).ensure_default_users()
    user = auth_service.authenticate_user(request_body.username, request_body.password)
    if not user:
        raise WebGuardException(status_code=401, detail="invalid username or password", code=40101)

    raw_refresh_token, refresh_session = auth_service.create_web_session(
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    user.last_login_at = auth_service._now()
    access_token = auth_service.access_token_for_user(user, refresh_session)
    response = success_response(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expires_seconds,
            "user": _user_profile(user),
        }
    )
    _set_refresh_cookie(response, raw_refresh_token)
    db.commit()
    return response


@router.post("/refresh", response_model=ApiResponse[AuthTokenResponse])
def refresh(
    request: Request,
    refresh_token: str | None = Cookie(default=None, alias=settings.REFRESH_TOKEN_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    auth_service = AuthService(db)
    rotated = auth_service.rotate_refresh_token(
        refresh_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    if not rotated:
        raise WebGuardException(status_code=401, detail="refresh token invalid or expired", code=40101)
    user, raw_refresh_token, refresh_session = rotated
    access_token = auth_service.access_token_for_user(user, refresh_session)
    response = success_response(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expires_seconds,
            "user": _user_profile(user),
        }
    )
    _set_refresh_cookie(response, raw_refresh_token)
    db.commit()
    return response


@router.post("/logout")
def logout(
    refresh_token: str | None = Cookie(default=None, alias=settings.REFRESH_TOKEN_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    auth_service = AuthService(db)
    auth_service.revoke_raw_refresh_token(refresh_token)
    response = success_response({"logged_out": True})
    _clear_refresh_cookie(response)
    db.commit()
    return response


@router.get("/me", response_model=ApiResponse[UserProfileResponse])
def me(principal: Principal = Depends(require_auth), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == principal.username).first()
    if not user or not user.is_active:
        raise WebGuardException(status_code=401, detail="user inactive", code=40101)
    return ok(_user_profile(user))
