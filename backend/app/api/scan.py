from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.auth_context import Principal, ok, principal_from_headers
from ..core.exceptions import DatabaseError, ModelServiceError, ParameterError, RuleEngineError
from ..schemas import ApiResponse, PageScanRequest, ScanResult, UrlScanRequest
from ..services.scan_service import ScanService

router = APIRouter(prefix="/api/v1/scan", tags=["scan"])


@router.post("/url", response_model=ApiResponse[ScanResult])
def scan_url(
    request: UrlScanRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    if not request.url:
        raise ParameterError("URL不能为空")
    try:
        result = ScanService(db).scan_url(request.url, source="manual", username=principal.username)
        return ok(result)
    except ParameterError:
        raise
    except (DatabaseError, ModelServiceError, RuleEngineError):
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.post("/page", response_model=ApiResponse[ScanResult])
def scan_page(
    request: PageScanRequest,
    principal: Principal = Depends(principal_from_headers),
    db: Session = Depends(get_db),
):
    if not request.url:
        raise ParameterError("URL不能为空")
    try:
        result = ScanService(db).scan_page(
            {
                "url": request.url,
                "title": request.title,
                "visible_text": request.visible_text,
                "button_texts": request.button_texts,
                "input_labels": request.input_labels,
                "form_action_domains": request.form_action_domains,
                "has_password_input": request.has_password_input,
            },
            source=request.source,
            username=principal.username,
        )
        return ok(result)
    except ParameterError:
        raise
    except (DatabaseError, ModelServiceError, RuleEngineError):
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="服务器内部错误")
