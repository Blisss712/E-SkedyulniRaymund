from uuid import UUID

from ..core.errors import ServiceUnavailableError, UnauthorizedError
from ..repositories.admin_repository import AdminRepository
from ..schemas.auth import AuthenticatedUser
from ..supabase import SupabaseService

class AuthService:
    def __init__(self, settings, supabase_service: SupabaseService):
        self.settings = settings
        self.supabase = supabase_service

    def login(self, session, username: str, password: str):
        profile = AdminRepository(session).by_username_or_email(username)
        if not profile or not profile.active or profile.role != "admin":
            raise UnauthorizedError("The username or password is incorrect.")
        if not self.supabase.configured():
            raise ServiceUnavailableError("Supabase authentication is not configured.")
        try:
            response = self.supabase.auth_client().auth.sign_in_with_password({"email": profile.email, "password": password})
        except Exception as exc:
            raise UnauthorizedError("The username or password is incorrect.") from exc
        auth_user = getattr(response, "user", None)
        auth_session = getattr(response, "session", None)
        access_token = getattr(auth_session, "access_token", None) if auth_session else None
        if not auth_user or not access_token:
            raise UnauthorizedError("The username or password is incorrect.")
        try:
            authenticated_id = UUID(str(auth_user.id))
        except (AttributeError, ValueError) as exc:
            raise UnauthorizedError("The authenticated administrator could not be verified.") from exc
        if authenticated_id != profile.user_id:
            raise UnauthorizedError("The authenticated administrator could not be verified.")
        return {
            "access_token": access_token,
            "user": AuthenticatedUser(
                id=profile.user_id,
                username=profile.username,
                email=profile.email,
                fullName=profile.full_name,
                role=profile.role,
            ),
        }

    def verify(self, session, token: str):
        if not self.supabase.configured():
            raise ServiceUnavailableError("Supabase authentication is not configured.")
        try:
            response = self.supabase.auth_client().auth.get_user(token)
        except Exception as exc:
            raise UnauthorizedError() from exc
        user = getattr(response, "user", None)
        user_id = getattr(user, "id", None)
        if not user_id:
            raise UnauthorizedError()
        try:
            uid = UUID(str(user_id))
        except ValueError as exc:
            raise UnauthorizedError() from exc
        profile = AdminRepository(session).by_user_id(uid)
        if not profile or not profile.active or profile.role != "admin":
            raise UnauthorizedError("Administrator privileges are required.")
        return profile
