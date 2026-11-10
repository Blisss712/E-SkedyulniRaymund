from fastapi import APIRouter

from ..config import Settings
from ..database import Database
from ..schemas.auth import LoginRequest, TokenResponse
from ..services.auth_service import AuthService
from ..supabase import SupabaseService

router = APIRouter(prefix="/admin/auth", tags=["Admin Auth"])
settings = Settings.from_env()
database = Database(settings.database_url)
auth_service = AuthService(settings, SupabaseService(settings))

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    with database.session() as session:
        return auth_service.login(session, data.username, data.password)

@router.post("/logout")
def logout():
    return {"message": "Signed out successfully. The frontend should clear the Supabase session."}
