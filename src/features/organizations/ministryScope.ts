import { isSupabaseConfigured } from "../../lib/supabase"
import type { AdminEvent } from "../admin/types"
import type { Ministry } from "../../shared/home"

/**
 * The events the member's timetable may show for the ministry scope selected in
 * the dashboard header.
 *
 * A member can belong to several ministries, and every event belongs to exactly
 * one of them (`AdminEvent.organizationId`). Without this filter the timetable
 * mixed every ministry's events into one week while the header still named a
 * single "Current ministry", so switching ministries changed nothing.
 *
 * The scope is either one approved ministry or the selector's "All ministries"
 * entry (`ministry.all`), which stands for every approved ministry at once.
 * Requests still waiting for approval are never in scope.
 *
 * The offline demo builds its sample ministries and sample events from separate
 * fixtures with no shared ids, so there is nothing to match there; it keeps its
 * sample week instead of showing an empty timetable.
 */
export function eventsForScope(
  events: AdminEvent[],
  ministry: Ministry | null,
  joinedMinistries: Ministry[],
): AdminEvent[] {
  if (!isSupabaseConfigured) return events

  // No selected scope means the member has no approved ministry yet, so there is
  // nothing that can be in scope.
  if (!ministry) return []

  const scopeIds = ministry.all
    ? new Set(joinedMinistries.map(item => item.id))
    : new Set([ministry.id])

  return events.filter(event => scopeIds.has(event.organizationId))
}
