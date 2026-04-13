from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..schemas import ApiResponse


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class MockLoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    role: str = Field("user", pattern="^(admin|user)$")


class MockLoginResponse(BaseModel):
    username: str
    role: str
    display_name: str


@router.post("/mock-login", response_model=ApiResponse[MockLoginResponse])
def mock_login(request: MockLoginRequest):
    display_name = request.username.strip() or ("安全运营管理员" if request.role == "admin" else "受保护用户")
    return {
        "code": 0,
        "message": "success",
        "data": {
            "username": request.username.strip(),
            "role": request.role,
            "display_name": display_name,
        },
    }
