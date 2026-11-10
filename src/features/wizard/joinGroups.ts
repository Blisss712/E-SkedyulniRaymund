import { isMemberApiConfigured, memberApi } from "../../lib/memberApi"
import { isSupabaseConfigured } from "../../lib/supabase"
import { findOrganizationByJoinCode } from "../organizations/api"
import { EXAMPLE_GROUPS } from "./data"

/**
 * Only the offline demo shows the bundled sample codes. Once a real data source
 * is connected an unknown code must stay unknown instead of resolving to a
 * sample group that does not exist in the administrator's Organizations list.
 */
export const usesSampleGroups = !isMemberApiConfigured && !isSupabaseConfigured

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
 * link — into the organization it belongs to.
 *
 * The organization id is what ties the request to the Organizations list the
 * administrator sees, so it travels with the name all the way to the request.
 *
 *   1. When the FastAPI backend is configured, it owns the lookup.
 *   2. Otherwise the active organizations are read straight from Supabase.
 *   3. The bundled sample codes remain as a last resort for the demo mode.
 */
export async function resolveGroup(code: string): Promise<{ id?: string; name?: string }> {
  if (isMemberApiConfigured) {
    const group = await memberApi.lookupGroup(code)
    return { id: group.id, name: group.name }
  }

  if (isSupabaseConfigured) {
    const organization = await findOrganizationByJoinCode(code)
    return organization ? { id: organization.id, name: organization.name } : {}
  }

  return { name: EXAMPLE_GROUPS[code] }
}
