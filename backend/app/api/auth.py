from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core import get_db, settings
from ..core.auth_context import ok
from ..core.exceptions import WebGuardException
from ..core.security import create_access_token
from ..schemas import ApiResponse
from ..services.user_service import UserService


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class MockLoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    role: str = Field("user", pattern="^(admin|user)$")


class MockLoginResponse(BaseModel):
    username: str
    role: str
    display_name: str
    access_token: str
    token_type: str = "Bearer"
    expires_in: int


@router.post("/mock-login", response_model=ApiResponse[MockLoginResponse])
def mock_login(request: MockLoginRequest, db: Session = Depends(get_db)):
    """Development-only login helper.

    Keep this endpoint isolated so it can be replaced by real authentication
    without changing the rest of the frontend auth context.
    """
    if not settings.mock_login_enabled:
        raise WebGuardException(status_code=403, detail="mock login is disabled", code=40301)

    username = request.username.strip() or ("platform-admin" if request.role == "admin" else "platform-user")
    display_name = "安全运营管理员" if request.role == "admin" else "受保护用户"
    user = UserService(db).get_or_create_user(username, role=request.role)
    user.display_name = display_name
    db.commit()
    db.refresh(user)
    access_token = create_access_token(subject=user.username, role=user.role)

    return ok(
        {
            "username": user.username,
            "role": user.role,
            "display_name": user.display_name,
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expires_seconds,
        }
    )
