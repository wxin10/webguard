from fastapi import HTTPException


class WebGuardException(HTTPException):
    """Base application exception with a stable business code."""

    def __init__(self, status_code: int = 400, detail: str = "request failed", code: int = 40001):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


class ParameterError(WebGuardException):
    def __init__(self, detail: str = "invalid parameter", code: int = 40002):
        super().__init__(status_code=400, detail=detail, code=code)


class DatabaseError(WebGuardException):
    def __init__(self, detail: str = "database operation failed", code: int = 50001):
        super().__init__(status_code=500, detail=detail, code=code)


class RuleEngineError(WebGuardException):
    def __init__(self, detail: str = "rule engine failed", code: int = 50001):
        super().__init__(status_code=500, detail=detail, code=code)
