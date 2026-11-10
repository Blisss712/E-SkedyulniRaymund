import { supabaseUrl } from "../../lib/supabase"

/**
 * Social sign-in (Google/Facebook/Apple) leaves the app entirely. When the
 * provider refuses the request, Supabase sends the browser back with
 * `?error=access_denied&error_description=...` instead of a session, and the app
 * used to land on the welcome screen as if nothing had happened. These helpers
 * turn that redirect into a message the member can act on.
 */
export type AuthRedirectFailure = {
  code: string
  description: string
  /** Ready-to-display explanation shown on the sign-in screen. */
  message: string
}

const REDIRECT_ERROR_KEYS = [
  "error",
  "error_code",
  "error_description",
  "error_uri",
] as const

function oauthCallbackUrl(): string {
  const base = supabaseUrl.replace(/\/+$/, "")
  return base
    ? `${base}/auth/v1/callback`
    : "https://<project-ref>.supabase.co/auth/v1/callback"
}

function appUrl(): string {
  return typeof window === "undefined" ? "your app URL" : window.location.origin
}

function describeAuthFailure(code: string, description: string): string {
  const detail = description.trim()
  const haystack = `${code} ${detail}`.toLowerCase()
  const callback = oauthCallbackUrl()

  // Meta answers a missing or unapproved permission with "Permissions error".
  if (haystack.includes("permission")) {
    return `Facebook refused the sign-in ("${detail || "Permissions error"}"). The Facebook app is most likely still in Development mode, or it is not allowed to read this account's email address. Add the account as a Tester/Administrator in the Meta app dashboard (or switch the app to Live), keep the email permission, and set the Valid OAuth Redirect URI to ${callback}.`
  }

  switch (code) {
    case "access_denied":
      return `The provider cancelled the sign-in${detail ? ` (${detail})` : ""}. Pick the account and approve the requested permissions to continue.`
    case "redirect_uri_mismatch":
      return `The provider rejected the callback URL${detail ? ` (${detail})` : ""}. Allow ${appUrl()} under Authentication -> URL Configuration -> Redirect URLs in Supabase, and ${callback} in the provider's own client settings.`
    case "unauthorized_client":
      return `The provider does not recognise this app's client credentials${detail ? ` (${detail})` : ""}. Re-check the Client ID and Client Secret saved in Supabase Authentication -> Providers.`
    case "bad_oauth_state":
    case "bad_oauth_callback":
    case "bad_code_verifier":
      return "That sign-in link was stale or opened in a different browser tab. Close the old tab and start the sign-in again from this screen."
    case "invalid_request":
    case "server_error":
      return `The sign-in provider returned an error${detail ? ` (${detail})` : ""}. Verify the provider settings in Supabase Authentication -> Providers, then try again.`
    default:
      return detail ? `Sign-in failed: ${detail}` : `Sign-in failed (${code}). Please try again.`
  }
}

/** Reads the OAuth failure carried by the URL, if there is one. */
export function readAuthRedirectFailure(
  search: string,
  hash: string,
): AuthRedirectFailure | null {
  const query = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  )
  const fragment = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  )
  const pick = (key: string) => query.get(key) ?? fragment.get(key) ?? ""

  const code = pick("error") || pick("error_code")
  if (!code) return null

  const description = pick("error_description")
  return {
    code,
    description,
    message: describeAuthFailure(code, description),
  }
}

/** Reads the OAuth failure from the current browser location. */
export function authRedirectFailureFromLocation(): AuthRedirectFailure | null {
  if (typeof window === "undefined") return null
  return readAuthRedirectFailure(window.location.search, window.location.hash)
}

/**
 * Removes the `error*` parameters from the address bar so a reload does not
 * repeat a message the member has already seen. Access tokens in the hash of a
 * successful redirect are left untouched.
 */
export function clearAuthRedirectFailure(): void {
  if (typeof window === "undefined") return

  const url = new URL(window.location.href)
  let changed = false

  for (const key of REDIRECT_ERROR_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }

  if (url.hash.length > 1) {
    const fragment = new URLSearchParams(url.hash.slice(1))
    let fragmentChanged = false
    for (const key of REDIRECT_ERROR_KEYS) {
      if (fragment.has(key)) {
        fragment.delete(key)
        fragmentChanged = true
      }
    }
    if (fragmentChanged) {
      const next = fragment.toString()
      url.hash = next ? `#${next}` : ""
      changed = true
    }
  }

  if (!changed) return
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  )
}
