from fastapi import APIRouter

from .auth import router as auth_router
from .blacklist import router as blacklist_router
from .model import router as model_router
from .plugin import router as plugin_router
from .records import router as records_router
from .reports import router as reports_router
from .rules import router as rules_router
from .scan import router as scan_router
from .stats import router as stats_router
from .whitelist import router as whitelist_router


api_router = APIRouter()

api_router.include_router(scan_router)
api_router.include_router(records_router)
api_router.include_router(whitelist_router)
api_router.include_router(blacklist_router)
api_router.include_router(rules_router)
api_router.include_router(model_router)
api_router.include_router(stats_router)
api_router.include_router(plugin_router)
api_router.include_router(auth_router)
api_router.include_router(reports_router)

__all__ = ["api_router"]
