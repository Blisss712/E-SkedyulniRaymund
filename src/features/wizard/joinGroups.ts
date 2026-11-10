import { isMemberApiConfigured, memberApi } from "../../lib/memberApi"
import { isSupabaseConfigured, supabase } from "../../lib/supabase"
import { EXAMPLE_GROUPS } from "./data"

/**
 * Extracts the group code from a pasted join link, e.g.
 * "https://eskedyul.ph/join/ESK-LECTOR2025/" -> "ESK-LECTOR2025".
 * A bare code (no slashes) is returned as-is.
 */
export function groupCodeFromLink(link: string): string {
  const path = link.trim().split(/[?#]/)[0].replace(/\/+$/, "")
  return (path.split("/").pop() || "").toUpperCase().trim()
}

/**
 * Turns a group code — typed directly or taken from the end of a pasted join
 * link — into the ministry name shown on the confirmation screen.
 *
 * The FastAPI backend is only one of the possible sources:
 *   1. When VITE_MEMBER_API_URL is set, the backend owns the lookup.
 *   2. Otherwise the active organizations are read straight from Supabase, so
 *      a real code such as ESK-LECTOR2025 resolves without the backend.
 *   3. The bundled sample codes remain as a last resort for the demo mode.
 */
export async function resolveGroup(code: string): Promise<{ name?: string }> {
  if (isMemberApiConfigured) {
    return memberApi.lookupGroup(code)
  }

  if (isSupabaseConfigured) {
    // join_code is matched case-insensitively, so escape LIKE wildcards first.
    const pattern = code.replace(/[\\%_*]/g, character => `\\${character}`)

    const { data, error } = await supabase
      .from("organizations")
      .select("name")
      .ilike("join_code", pattern)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()

    if (!error && data?.name) {
      return { name: data.name }
    }
  }

  return { name: EXAMPLE_GROUPS[code] }
}
