import { useEffect, useState } from "react"
import { isSupabaseConfigured } from "../../lib/supabase"
import { fetchOrganizations } from "../organizations/api"
import { EXAMPLE_GROUPS } from "./data"

/**
 * One ministry a member can ask an administrator to be added to.
 *
 * `id` is the organization id the join request points at; it is absent only in
 * the offline demo, where there is no database to reference.
 */
export type MinistryOption = {
  id?: string
  name: string
  /** The category shown under the name, e.g. "Lectors" or "Choir". */
  category: string
}

/**
 * The ministries open for requests: the active organizations, which members are
 * allowed to read (see "Public read active organizations" in supabase/schema.sql).
 * The bundled sample groups stand in when the app runs without a database.
 */
async function loadMinistryOptions(): Promise<MinistryOption[]> {
  if (isSupabaseConfigured) {
    const organizations = await fetchOrganizations()
    return organizations
      .filter(organization => organization.status === "active")
      .map(organization => ({
        id: organization.id,
        name: organization.name,
        category: organization.category || "Ministry",
      }))
  }

  return Object.values(EXAMPLE_GROUPS).map(name => ({
    name,
    category: "Sample ministry",
  }))
}

/**
 * Loads the ministry list the first time the member opens the "request access"
 * form, so the group-code screen never pays for a query it may not need.
 */
export function useMinistryOptions(enabled: boolean) {
  const [options, setOptions] = useState<MinistryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    if (!enabled) return
    let active = true
    setLoading(true)

    loadMinistryOptions()
      .then(list => {
        if (!active) return
        setOptions(list)
        setLoadError("")
      })
      .catch((reason: unknown) => {
        if (!active) return
        setOptions([])
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the list of ministries.",
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [enabled])

  return { options, loading, loadError }
}
