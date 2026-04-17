from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class BaseResponse(BaseModel):
    success: bool = True
    code: int
    message: str
    data: Optional[Any] = None


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    code: int
    message: str
    data: Optional[T] = None


class PaginationQuery(BaseModel):
    page: int = 1
    page_size: int = 10
