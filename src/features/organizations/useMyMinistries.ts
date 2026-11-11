import { useCallback, useEffect, useState } from "react"
import { DEMO_MEMBER_ID, useAuth } from "../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"
import type { Ministry } from "../../shared/home"
import { fetchMyMinistries } from "./api"

/**
 * The sample ministries used by the offline demo, where no database is
 * connected. With Supabase configured the member's real memberships are shown
 * instead; the bundled list never stands in for them.
 */
export const DEMO_MINISTRIES: Ministry[] = [
  { id: "lectors", name: "Lectors", parish: "St. Joseph Parish" },
  { id: "altar", name: "Altar Servers", parish: "St. Joseph Parish" },
  { id: "choir", name: "Parish Choir", parish: "St. Joseph Parish" },
  { id: "youth", name: "Youth Ministry", parish: "St. Joseph Parish", waiting: true },
]

function demoMinistriesFor(userId: string): Ministry[] {
  return userId === DEMO_MEMBER_ID
    ? DEMO_MINISTRIES.filter(ministry => ministry.id === "altar")
    : DEMO_MINISTRIES
}

/**
 * The ministries shown on the member dashboard.
 *
 * Both halves come from the tables the administrator manages, so a newly
 * approved request appears here without any extra wiring:
 *   - organization_member_accounts -> ministries the member belongs to
 *   - organization_join_requests   -> requests still waiting for approval
 */
export function useMyMinistries() {
  const { user } = useAuth()
  const userId = user?.id ?? ""

  const [items, setItems] = useState<Ministry[]>(
    isSupabaseConfigured ? [] : demoMinistriesFor(userId),
  )
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setItems(demoMinistriesFor(userId))
      setLoading(false)
      setError("")
      return
    }

    if (!userId) {
      // Signed out: there are no memberships to show. Showing the samples here
      // is what made the dashboard look out of sync with the Organizations page.
      setItems([])
      setLoading(false)
      setError("")
      return
    }

    setLoading(true)
    try {
      setItems(await fetchMyMinistries(userId))
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load your ministries.")
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { items, loading, error, refresh }
}
