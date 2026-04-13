from pydantic import BaseModel
from typing import Any, Optional, Generic, TypeVar

T = TypeVar('T')


class BaseResponse(BaseModel):
    """基础响应模式"""
    code: int
    message: str
    data: Optional[Any] = None


class ApiResponse(BaseModel, Generic[T]):
    """统一API响应模型"""
    code: int
    message: str
    data: Optional[T] = None


class PaginationQuery(BaseModel):
    """分页查询参数"""
    page: int = 1
    page_size: int = 10
