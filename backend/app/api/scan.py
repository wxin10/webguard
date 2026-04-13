from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..core import get_db
from ..core.exceptions import ParameterError, DatabaseError, ModelServiceError, RuleEngineError
from ..schemas import UrlScanRequest, PageScanRequest, ScanResult, ApiResponse
from ..services import Detector

router = APIRouter(prefix="/api/v1/scan", tags=["scan"])


@router.post("/url", response_model=ApiResponse[ScanResult])
def scan_url(request: UrlScanRequest, db: Session = Depends(get_db)):
    """扫描URL"""
    # 参数验证
    if not request.url:
        raise ParameterError("URL不能为空")
    
    try:
        detector = Detector(db)
        result = detector.detect_url(request.url, source="manual")
        return {
            "code": 0,
            "message": "success",
            "data": result
        }
    except ParameterError:
        raise
    except (DatabaseError, ModelServiceError, RuleEngineError):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.post("/page", response_model=ApiResponse[ScanResult])
def scan_page(request: PageScanRequest, db: Session = Depends(get_db)):
    """扫描页面"""
    # 参数验证
    if not request.url:
        raise ParameterError("URL不能为空")
    
    try:
        detector = Detector(db)
        page_data = {
            "url": request.url,
            "title": request.title,
            "visible_text": request.visible_text,
            "button_texts": request.button_texts,
            "input_labels": request.input_labels,
            "form_action_domains": request.form_action_domains,
            "has_password_input": request.has_password_input
        }
        result = detector.detect_page(page_data, source=request.source)
        return {
            "code": 0,
            "message": "success",
            "data": result
        }
    except ParameterError:
        raise
    except (DatabaseError, ModelServiceError, RuleEngineError):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="服务器内部错误")
