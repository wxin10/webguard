from typing import Any

from fastapi.responses import JSONResponse


SUCCESS_CODE = 0

ERROR_CODE_BY_STATUS: dict[int, int] = {
    400: 40001,
    401: 40101,
    403: 40301,
    404: 40401,
    409: 40901,
    422: 42201,
    429: 42901,
    500: 50001,
    502: 50001,
    503: 50301,
}

DEFAULT_ERROR_MESSAGE_BY_STATUS: dict[int, str] = {
    400: "invalid request",
    401: "authentication required",
    403: "permission denied",
    404: "resource not found",
    409: "resource conflict",
    422: "business validation failed",
    429: "rate limited",
    500: "internal server error",
    502: "internal server error",
    503: "upstream unavailable",
}


def error_code_for_status(status_code: int) -> int:
    return ERROR_CODE_BY_STATUS.get(status_code, 50001 if status_code >= 500 else 40001)


def normalize_error_code(code: int | None, status_code: int) -> int:
    if code is None:
        return error_code_for_status(status_code)
    if code in ERROR_CODE_BY_STATUS:
        return error_code_for_status(code)
    return code


def response_payload(code: int, message: str, data: Any = None) -> dict[str, Any]:
    return {"code": code, "message": message, "data": data}


def success_payload(data: Any = None, message: str = "success") -> dict[str, Any]:
    return response_payload(SUCCESS_CODE, message, data)


def error_payload(
    message: str | None = None,
    *,
    status_code: int,
    code: int | None = None,
    data: Any = None,
) -> dict[str, Any]:
    resolved_code = normalize_error_code(code, status_code)
    resolved_message = message or DEFAULT_ERROR_MESSAGE_BY_STATUS.get(status_code, "request failed")
    return response_payload(resolved_code, resolved_message, data)


def success_response(data: Any = None, message: str = "success", status_code: int = 200) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=success_payload(data, message))


def error_response(
    message: str | None = None,
    *,
    status_code: int,
    code: int | None = None,
    data: Any = None,
) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_payload(message, status_code=status_code, code=code, data=data))


class APIResponse:
    """Backward-compatible wrapper around the unified response helpers."""

    @staticmethod
    def success(data: Any = None, message: str = "success") -> JSONResponse:
        return success_response(data=data, message=message)

    @staticmethod
    def error(
        code: int | None = None,
        message: str | None = None,
        data: Any = None,
        status_code: int = 400,
    ) -> JSONResponse:
        return error_response(message=message, status_code=status_code, code=code, data=data)
