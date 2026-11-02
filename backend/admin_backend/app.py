from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .database import Database
from .core.errors import AdminError
from .routes import api_router
from .supabase import SupabaseService

settings = Settings.from_env()
database = Database(settings.database_url)
supabase_service = SupabaseService(settings)

def create_app() -> FastAPI:
    if settings.auto_create_tables:
        database.create_tables()
    app = FastAPI(title="E-Skedyul Admin API", version="2.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AdminError)
    async def admin_error(_: Request, exc: AdminError):
        return JSONResponse({"detail": exc.message}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse({"detail": "; ".join(str(error.get("msg", "Invalid value.")) for error in exc.errors())}, status_code=422)

    @app.get("/admin/health")
    def health():
        return {
            "status": "ok",
            "module": "admin",
            "supabaseConfigured": supabase_service.configured(),
            "databaseConfigured": bool(settings.database_url),
        }

    app.include_router(api_router)
    return app

app = create_app()
