from fastapi import APIRouter

from .auth import router as auth_router
from .dashboard import router as dashboard_router
from .events import router as events_router
from .organizations import router as organizations_router
from .join_requests import admin_router as admin_join_requests_router
from .join_requests import member_router as member_join_requests_router
from .member import router as member_router

api_router = APIRouter()
api_router.routes.extend(auth_router.routes)
api_router.routes.extend(dashboard_router.routes)
api_router.routes.extend(organizations_router.routes)
api_router.routes.extend(events_router.routes)
api_router.routes.extend(member_join_requests_router.routes)
api_router.routes.extend(admin_join_requests_router.routes)
api_router.routes.extend(member_router.routes)
