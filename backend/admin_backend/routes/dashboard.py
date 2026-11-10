from fastapi import APIRouter, Depends

from ..config import Settings
from ..database import Database
from ..services.dashboard_service import DashboardService
from .deps import require_admin
from .events import to_response

router = APIRouter(prefix="/admin/dashboard", tags=["Admin Dashboard"])
settings = Settings.from_env()
database = Database(settings.database_url)

@router.get("")
def dashboard(_: dict = Depends(require_admin)):
    with database.session() as session:
        summary = DashboardService(session).summary()
        summary["nextEvents"] = [to_response(event) for event in summary["nextEvents"]]
        return summary
