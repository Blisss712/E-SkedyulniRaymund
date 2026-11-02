import os
from datetime import datetime, timezone
from uuid import UUID

from dotenv import load_dotenv
from supabase import create_client
from supabase.lib.client_options import ClientOptions

from admin_backend.database import Database
from admin_backend.models.admin_profile import AdminProfile

load_dotenv()

settings = {
    "url": os.getenv("SUPABASE_URL", ""),
    "secret": os.getenv("SUPABASE_SECRET_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")),
    "email": os.getenv("ADMIN_EMAIL", "admin@eskedyul.app"),
    "password": os.getenv("ADMIN_PASSWORD", ""),
    "username": os.getenv("ADMIN_USERNAME", "admin"),
    "full_name": os.getenv("ADMIN_FULL_NAME", "Platform Admin"),
    "database_url": os.getenv("DATABASE_URL", ""),
}

if not settings["url"] or not settings["secret"] or not settings["password"] or not settings["database_url"]:
    raise SystemExit("SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD, and DATABASE_URL are required.")

supabase = create_client(
    settings["url"],
    settings["secret"],
    options=ClientOptions(auto_refresh_token=False, persist_session=False),
)

try:
    response = supabase.auth.admin.create_user({
        "email": settings["email"],
        "password": settings["password"],
        "email_confirm": True,
    })
    user = response.user
except Exception as exc:
    raise SystemExit(f"Could not create Supabase Auth user: {exc}") from exc

user_id = UUID(str(user.id))
database = Database(settings["database_url"])
with database.session() as session:
    profile = session.get(AdminProfile, user_id)
    if profile:
        profile.username = settings["username"]
        profile.email = settings["email"]
        profile.full_name = settings["full_name"]
        profile.role = "admin"
        profile.active = True
    else:
        session.add(AdminProfile(
            user_id=user_id,
            username=settings["username"],
            email=settings["email"],
            full_name=settings["full_name"],
            role="admin",
            active=True,
            created_at=datetime.now(timezone.utc),
        ))
    session.commit()

print(f"Admin created: {settings['username']} / {settings['email']}")
