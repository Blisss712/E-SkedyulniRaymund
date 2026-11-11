import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env no matter which directory uvicorn was started from. The
# README starts it from the repository root with `--app-dir backend`, and a bare
# load_dotenv() would only find the root .env in that case.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

@dataclass(frozen=True)
class Settings:
    database_url: str
    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    admin_username: str
    cors_origins: tuple[str, ...]
    auto_create_tables: bool
    gemini_api_key: str
    gemini_model: str
    gemini_fallback_models: tuple[str, ...]
    gemini_api_base: str

    @classmethod
    def from_env(cls) -> "Settings":
        origins = tuple(
            value.strip()
            for value in os.getenv("CORS_ORIGINS", "http://localhost:8443").split(",")
            if value.strip()
        )
        return cls(
            database_url=os.getenv("DATABASE_URL", ""),
            supabase_url=os.getenv("SUPABASE_URL", ""),
            supabase_publishable_key=os.getenv("SUPABASE_PUBLISHABLE_KEY", os.getenv("SUPABASE_ANON_KEY", "")),
            supabase_secret_key=os.getenv("SUPABASE_SECRET_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")),
            admin_username=os.getenv("ADMIN_USERNAME", "admin"),
            cors_origins=origins,
            auto_create_tables=os.getenv("AUTO_CREATE_TABLES", "false").strip().lower() == "true",
            # The assistant's key is server-only. Never expose it through a VITE_* variable.
            gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.6-flash").strip() or "gemini-3.6-flash",
            gemini_fallback_models=tuple(
                value.strip()
                for value in os.getenv(
                    "GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite"
                ).split(",")
                if value.strip()
            ),
            gemini_api_base=os.getenv(
                "GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta"
            ).strip().rstrip("/"),
        )
