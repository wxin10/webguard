from typing import Any, Optional
from fastapi import Response
from fastapi.responses import JSONResponse


class APIResponse:
    """统一API响应类"""
    
    @staticmethod
    def success(data: Any = None, message: str = "success") -> JSONResponse:
        """成功响应"""
        return JSONResponse(
            status_code=200,
            content={
                "code": 0,
                "success": True,
                "message": message,
                "data": data
            }
        )
    
    @staticmethod
    def error(code: int = 1, message: str = "error", data: Any = None) -> JSONResponse:
        """错误响应"""
        return JSONResponse(
            status_code=400,
            content={
                "code": code,
                "success": False,
                "message": message,
                "data": data
            }
        )
