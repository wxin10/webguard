from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import api_router
from .core import settings
from .core.database import Base, engine
from .core.exceptions import WebGuardException
from .core.schema_migrations import ensure_runtime_schema


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="WebGuard - 基于浏览器插件与 Web 后台联动的恶意网站检测与主动防御系统",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.detail, "data": None},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": exc.detail, "data": None},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": "服务器内部错误", "data": None},
    )


app.include_router(api_router)


@app.get("/")
def read_root():
    return {
        "code": 0,
        "message": "success",
        "data": {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "description": "WebGuard - 基于浏览器插件与 Web 后台联动的恶意网站检测与主动防御系统",
        },
    }


@app.get("/health")
def health_check():
    return {"code": 0, "message": "success", "data": {"status": "healthy"}}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
