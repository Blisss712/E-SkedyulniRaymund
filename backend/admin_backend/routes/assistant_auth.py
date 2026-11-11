from fastapi import Header
import httpx

from ..config import Settings
from ..core.errors import ServiceUnavailableError, UnauthorizedError

settings = Settings.from_env()


def require_identity(authorization: str | None = Header(default=None)) -> str:
    """Verifies the member's Supabase token without the Supabase SDK or database.

    The assistant only needs to know that a signed-in account is asking; it
    never reads or writes member rows itself. Supabase's `/auth/v1/user`
    endpoint is the authority for the token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Sign in to use the assistant.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise UnauthorizedError("Sign in to use the assistant.")

    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise ServiceUnavailableError(
            "Supabase authentication is not configured on the assistant server."
        )

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    try:
        response = httpx.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_publishable_key,
            },
            timeout=httpx.Timeout(10.0, connect=5.0),
        )
    except httpx.HTTPError as exc:
        raise ServiceUnavailableError(
            "The assistant could not verify your session. Please try again."
        ) from exc

    if response.status_code in (401, 403):
        raise UnauthorizedError(
            "Your session expired. Sign in again to use the assistant."
        )
    if response.status_code >= 400:
        raise ServiceUnavailableError(
            "The assistant could not verify your session. Please try again."
        )

    try:
        user = response.json()
    except ValueError as exc:
        raise ServiceUnavailableError(
            "The assistant could not verify your session. Please try again."
        ) from exc

    user_id = user.get("id") if isinstance(user, dict) else None
    if not user_id:
        raise UnauthorizedError("Sign in to use the assistant.")
    return str(user_id)
