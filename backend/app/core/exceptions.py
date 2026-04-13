from fastapi import HTTPException
from typing import Optional


class WebGuardException(HTTPException):
    """WebGuard 基础异常类"""
    def __init__(self, status_code: int = 400, detail: str = "错误", code: int = 1):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


class ParameterError(WebGuardException):
    """参数错误异常"""
    def __init__(self, detail: str = "参数错误", code: int = 400):
        super().__init__(status_code=400, detail=detail, code=code)


class DatabaseError(WebGuardException):
    """数据库异常"""
    def __init__(self, detail: str = "数据库操作失败", code: int = 500):
        super().__init__(status_code=500, detail=detail, code=code)


class ModelServiceError(WebGuardException):
    """模型服务异常"""
    def __init__(self, detail: str = "模型服务失败", code: int = 500):
        super().__init__(status_code=500, detail=detail, code=code)


class RuleEngineError(WebGuardException):
    """规则引擎异常"""
    def __init__(self, detail: str = "规则引擎失败", code: int = 500):
        super().__init__(status_code=500, detail=detail, code=code)
