from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .api import api_router
from .core import settings
from .core.database import Base, engine
from .core.exceptions import WebGuardException
from .core.response import error_response, success_payload
from .core.schema_migrations import ensure_runtime_schema


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="WebGuard - 基于浏览器插件与 Web 后台联动的恶意网站检测与主动防御系统",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema(engine)


@app.exception_handler(WebGuardException)
async def webguard_exception_handler(request: Request, exc: WebGuardException):
    return error_response(message=exc.detail, status_code=exc.status_code, code=exc.code)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else None
    body_code = None
    data = None
    if isinstance(exc.detail, dict):
        body_code = exc.detail.get("code")
        detail = exc.detail.get("message")
        data = exc.detail.get("data")
    return error_response(message=detail, status_code=exc.status_code, code=body_code, data=data)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return error_response(message="invalid parameter", status_code=400, code=40002)


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return error_response(message="internal server error", status_code=500, code=50001)


app.include_router(api_router)


@app.get("/")
def read_root():
    return success_payload(
        {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "description": "WebGuard - 基于浏览器插件与 Web 后台联动的恶意网站检测与主动防御系统",
        }
    )


@app.get("/health")
def health_check():
    return success_payload({"status": "healthy"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
