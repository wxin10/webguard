from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import Principal, ok, principal_from_headers, require_auth
from ..core.exceptions import WebGuardException
from ..schemas import AIConfig, AIConfigTestRequest, AIConfigUpdateRequest, AIStatus, AITestRequest, AITestResponse, ApiResponse
from ..services.ai_config_service import AIConfigService


router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _require_admin(principal: Principal) -> None:
    if not principal.is_admin:
        raise WebGuardException(status_code=403, detail="admin permission required", code=40301)


@router.get("/status", response_model=ApiResponse[AIStatus])
def get_ai_status(
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    return ok(AIConfigService(db).get_effective_config().public_dict())


@router.post("/test", response_model=ApiResponse[AITestResponse])
def test_ai_connection(
    request: AITestRequest,
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _require_admin(principal)
    test_request = AIConfigTestRequest(
        title=request.title,
        visible_text=request.visible_text,
        url=request.url,
        has_password_input=request.has_password_input,
        button_texts=request.button_texts,
        input_labels=request.input_labels,
        form_action_domains=request.form_action_domains,
    )
    return ok(AIConfigService(db).test_config(test_request, username=principal.username, save_result=False))


@router.get("/config", response_model=ApiResponse[AIConfig])
def get_ai_config(
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _require_admin(principal)
    return ok(AIConfigService(db).get_admin_config())


@router.put("/config", response_model=ApiResponse[AIConfig])
def update_ai_config(
    request: AIConfigUpdateRequest,
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _require_admin(principal)
    return ok(AIConfigService(db).update_config_by_admin(request, principal.username))


@router.delete("/config/key", response_model=ApiResponse[AIConfig])
def clear_ai_config_key(
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _require_admin(principal)
    return ok(AIConfigService(db).clear_api_key(principal.username))


@router.post("/config/test", response_model=ApiResponse[AITestResponse])
def test_ai_config(
    request: AIConfigTestRequest | None = None,
    principal: Principal = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _require_admin(principal)
    return ok(AIConfigService(db).test_config(request, username=principal.username, save_result=True))
