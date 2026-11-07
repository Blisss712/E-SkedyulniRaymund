from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from .config import Settings

class SupabaseService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def auth_client(self) -> Client:
        return create_client(
            self.settings.supabase_url,
            self.settings.supabase_publishable_key,
            options=ClientOptions(auto_refresh_token=False, persist_session=False),
        )

    def admin_client(self) -> Client:
        return create_client(
            self.settings.supabase_url,
            self.settings.supabase_secret_key,
            options=ClientOptions(auto_refresh_token=False, persist_session=False),
        )

    def configured(self) -> bool:
        return bool(self.settings.supabase_url and self.settings.supabase_publishable_key)
