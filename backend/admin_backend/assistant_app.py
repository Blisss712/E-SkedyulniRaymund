"""A lightweight assistant-only API.

Run this when you only need the dashboard assistant and do not want to
configure the full admin/member backend:

    uvicorn admin_backend.assistant_app:app --app-dir backend --reload --port 8001

It reads `backend/.env`, verifies the member's Supabase token, and calls Gemini
with the server-side `GEMINI_API_KEY`. It never accepts a key from the browser.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .core.errors import AdminError
from .routes.assistant import router as assistant_router

settings = Settings.from_env()


def create_app() -> FastAPI:
    app = FastAPI(title="E-Skedyul Assistant API", version="1.0.0")

    # Bearer tokens are sent explicitly by the app, not as cookies, so a wide
    # origin list is safe here and avoids CORS friction with the Figma preview.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AdminError)
    async def admin_error(_: Request, exc: AdminError):
        return JSONResponse(
            {"detail": exc.message}, status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse(
            {
                "detail": "; ".join(
                    str(error.get("msg", "Invalid value."))
                    for error in exc.errors()
                )
            },
            status_code=422,
        )

    app.include_router(assistant_router)
    return app


app = create_app()
