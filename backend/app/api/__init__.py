from fastapi import APIRouter

from .auth import router as auth_router
from .admin import router as admin_router
from .blacklist import router as blacklist_router
from .feedback import router as feedback_router
from .model import router as model_router
from .my import router as my_router
from .plugin import router as plugin_router
from .records import router as records_router
from .reports import router as reports_router
from .rules import router as rules_router
from .scan import router as scan_router
from .stats import router as stats_router
from .user import router as user_router
from .whitelist import router as whitelist_router


api_router = APIRouter()

api_router.include_router(scan_router)
api_router.include_router(my_router)
api_router.include_router(admin_router)
api_router.include_router(feedback_router)
api_router.include_router(records_router)
api_router.include_router(whitelist_router)
api_router.include_router(blacklist_router)
api_router.include_router(rules_router)
api_router.include_router(model_router)
api_router.include_router(stats_router)
api_router.include_router(plugin_router)
api_router.include_router(auth_router)
api_router.include_router(reports_router)
api_router.include_router(user_router)

__all__ = ["api_router"]
