import { createClient } from "@supabase/supabase-js"

/** The configured project URL, exported so auth screens can name the OAuth callback. */
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || ""
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ""

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "https://YOUR_PROJECT_REF.supabase.co" &&
    !supabaseUrl.includes("YOUR_PROJECT_REF"),
)

/**
 * Reads the auth link type from the URL before createClient() consumes it.
 *
 * A password-recovery email returns with `type=recovery` in the fragment (the
 * implicit flow) or the query. The auth event that says so can fire before React
 * has subscribed, so the initial screen is decided from this value as well.
 */
function readInitialAuthLinkType(): string {
  if (typeof window === "undefined") return ""
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const query = new URLSearchParams(window.location.search)
  return fragment.get("type") || query.get("type") || ""
}

export const openedFromPasswordRecoveryLink =
  readInitialAuthLinkType() === "recovery"

// Fallback dummy URL and key to prevent createClient from crashing if unconfigured
const clientUrl = isSupabaseConfigured
  ? supabaseUrl
  : "https://placeholder.supabase.co"
const clientKey = isSupabaseConfigured ? supabaseAnonKey : "placeholder-key"

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    // Keep the member session across reloads so "Sign in" actually returns the
    // user to their account. The administrator workspace still requires a fresh
    // sign-in because its access is held in app state, not the Supabase session.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
