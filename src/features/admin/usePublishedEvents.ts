import { useEffect, useState } from "react"
import { useAuth } from "../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"
import { INITIAL_EVENTS } from "./data"
import { EVENTS_CHANGED_EVENT } from "./eventsSync"
import { fetchEvents } from "./supabaseEvents"
import type { AdminEvent } from "./types"

function sampleEvents() {
  return INITIAL_EVENTS.filter(event => event.status === "published")
}

/**
 * The published events shown on a member's timetable. Only published rows are
 * returned, and the list is re-read whenever an admin or coordinator saves,
 * cancels, or deletes an event in the same browser.
 */
export function usePublishedEvents(): AdminEvent[] {
  const { user } = useAuth()
  const userId = user?.id ?? ""
  const [events, setEvents] = useState<AdminEvent[]>(() =>
    isSupabaseConfigured ? [] : sampleEvents(),
  )

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setEvents(sampleEvents())
      return
    }
    if (!userId) {
      setEvents([])
      return
    }

    let active = true
    const load = () => {
      void fetchEvents()
        .then(list => {
          if (active) setEvents(list.filter(event => event.status === "published"))
        })
        .catch(() => {
          // The timetable simply keeps whatever it already had.
        })
    }

    load()
    window.addEventListener(EVENTS_CHANGED_EVENT, load)
    return () => {
      active = false
      window.removeEventListener(EVENTS_CHANGED_EVENT, load)
    }
  }, [userId])

  return events
}
