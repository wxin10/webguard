from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core import get_db
from ..schemas import ApiResponse, ModelStatus, ModelVersion, ModelVersionList
from ..services import ModelService


router = APIRouter(prefix="/api/v1/model", tags=["model"])


@router.get("/status", response_model=ApiResponse[ModelStatus])
def get_model_status(db: Session = Depends(get_db)):
    model_service = ModelService(db)
    status = model_service.get_model_status()
    active_model = ModelVersion.model_validate(status["active_model"]) if status.get("active_model") else None

    return {
        "code": 0,
        "message": "success",
        "data": {
            "active_model": active_model,
            "model_count": status["model_count"],
            "model_type": status.get("model_type"),
            "loaded_model_dir": status.get("loaded_model_dir"),
            "metadata": model_service.get_model_metadata(),
        },
    }


@router.get("/versions", response_model=ApiResponse[ModelVersionList])
def get_model_versions(db: Session = Depends(get_db)):
    model_service = ModelService(db)
    versions = [ModelVersion.model_validate(version) for version in model_service.get_model_versions()]
    return {
        "code": 0,
        "message": "success",
        "data": {
            "total": len(versions),
            "versions": versions,
        },
    }
