from typing import Any

from fastapi import APIRouter, Depends

from ..core import settings
from ..core.auth_context import Principal, ok, principal_from_headers, require_auth
from ..core.exceptions import WebGuardException
from ..schemas import AIStatus, AITestRequest, AITestResponse, ApiResponse
from ..services.deepseek_analysis_service import DeepSeekAnalysisService
from ..services.feature_extractor import FeatureExtractor


router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _deepseek_status_payload() -> dict[str, Any]:
    configured = settings.deepseek_configured
    mode = str(settings.DEEPSEEK_ENABLED or "auto").strip().lower()
    enabled = settings.deepseek_enabled
    message = None
    if not configured:
        message = "DEEPSEEK_API_KEY is not configured; detection falls back to rule engine only."
    if mode in {"false", "0", "off", "disabled", "no"}:
        message = "DeepSeek semantic analysis is disabled by configuration; detection falls back to rule engine only."
    return {
        "provider": "deepseek",
        "enabled": enabled,
        "configured": configured,
        "base_url": settings.DEEPSEEK_BASE_URL,
        "model": settings.DEEPSEEK_MODEL,
        "timeout_seconds": settings.DEEPSEEK_TIMEOUT_SECONDS,
        "api_key_masked": settings.deepseek_api_key_masked,
        "mode": "semantic_risk_analysis",
        "message": message,
    }


@router.get("/status", response_model=ApiResponse[AIStatus])
def get_ai_status(principal: Principal = Depends(principal_from_headers)):
    return ok(_deepseek_status_payload())


@router.post("/test", response_model=ApiResponse[AITestResponse])
def test_ai_connection(
    request: AITestRequest,
    principal: Principal = Depends(require_auth),
):
    if not principal.is_admin:
        raise WebGuardException(status_code=403, detail="admin permission required", code=40301)

    features = FeatureExtractor.extract_features(
        request.url,
        request.title,
        request.visible_text,
        request.button_texts,
        request.input_labels,
        request.form_action_domains,
        request.has_password_input,
    )
    behavior_signals = [
        {
            "rule_key": "password_field",
            "rule_name": "Password input present",
            "matched": bool(request.has_password_input),
            "severity": "low",
            "category": "page",
            "score": 7.0 if request.has_password_input else 0.0,
            "reason": "Page contains a password input." if request.has_password_input else "No password input in test sample.",
        }
    ]
    behavior_score = 35.0 if request.has_password_input else 25.0
    analysis = DeepSeekAnalysisService().analyze(
        features=features,
        behavior_score=behavior_score,
        behavior_signals=behavior_signals,
        threat_intel_hit=False,
    )
    return ok({"status": analysis.get("status", "error"), "analysis": analysis, "provider": "deepseek"})
