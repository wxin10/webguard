from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class ModelVersionBase(BaseModel):
    version: str
    name: str
    path: str
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    is_active: bool = False


class ModelVersion(ModelVersionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class ModelStatus(BaseModel):
    active_model: Optional[ModelVersion] = None
    model_count: int
    model_type: Optional[str] = None
    loaded_model_dir: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ModelVersionList(BaseModel):
    total: int
    versions: List[ModelVersion]
