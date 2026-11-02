import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

@dataclass(frozen=True)
class Settings:
    database_url: str
    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    admin_username: str
    cors_origins: tuple[str, ...]
    auto_create_tables: bool

    @classmethod
    def from_env(cls) -> "Settings":
        origins = tuple(
            value.strip()
            for value in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
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
        )
