import { isSupabaseConfigured } from "../../lib/supabase"
import type { AdminEvent } from "../admin/types"
import type { Ministry } from "../../shared/home"

/**
 * The events the member's timetable may show for the ministry selected in the
 * dashboard header.
 *
 * A member can belong to several ministries, and every event belongs to exactly
 * one of them (`AdminEvent.organizationId`). Without this filter the timetable
 * mixed every ministry's events into one week while the header still named a
 * single "Current ministry", so switching ministries changed nothing.
 *
 * The offline demo builds its sample ministries and sample events from separate
 * fixtures with no shared ids, so there is nothing to match there; it keeps its
 * sample week instead of showing an empty timetable.
 */
export function eventsForMinistry(
  events: AdminEvent[],
  ministry: Ministry | null,
): AdminEvent[] {
  if (!isSupabaseConfigured) return events

  // No selected ministry means no joined ministry, so there is nothing that can
  // be in scope. Pending requests are not ministries yet.
  if (!ministry) return []

  return events.filter(event => event.organizationId === ministry.id)
}
