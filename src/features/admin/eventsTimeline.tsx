import { useMemo } from "react"

import {
  WeekNav,
  WeeklyTimetable,
  addDaysTo,
  dayInWeek,
  localDateKey,
  mondayOf,
  type TimetableEvent,
} from "../availability/timetable"
import type { TimetablePosition } from "../availability/types"

import {
  eventOccurrences,
  eventSchedule,
  formatEventDates,
  scheduleIssue,
} from "./eventSchedule"
import type { AdminEvent, EventStatus, Organization } from "./types"

/**
 * The timeline view of the Events section. It places the workspace's events on
 * the same weekly timetable the members see on their dashboard, so an
 * administrator or coordinator can spot clashes and quiet weeks at a glance
 * instead of scanning a list.
 *
 * An event's own status picks its colour, and an event that runs over several
 * days gets one block on each of those days — exactly like it appears to a
 * member once it is published.
 */

const STATUS_COLOR: Record<EventStatus, TimetableEvent["color"]> = {
  published: "navy",
  draft: "gold",
  cancelled: "red",
  completed: "green",
}

const STATUS_LEGEND: Array<{ status: EventStatus; label: string }> = [
  { status: "published", label: "Published" },
  { status: "draft", label: "Draft" },
  { status: "cancelled", label: "Cancelled" },
  { status: "completed", label: "Completed" },
]

const STATUS_NOTE: Record<EventStatus, string> = {
  published: "Published — members see this event on their own schedule.",
  draft: "Draft — only the workspace can see it until it is published.",
  cancelled: "Cancelled — members no longer see this event on their schedule.",
  completed: "Completed — this event has already taken place.",
}

/** "Nov 9, 2026, 6:00 PM" for the registration deadline, or the raw value. */
function formatDeadline(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export function EventsTimeline({
  events,
  organizations,
  position,
  onPositionChange,
  onEdit,
}: {
  /** The events already narrowed by the section's search and status filters. */
  events: AdminEvent[]
  organizations: Organization[]
  /** The week and week/day choice, kept by the workspace so it survives a form. */
  position: TimetablePosition
  onPositionChange: (change: Partial<TimetablePosition>) => void
  onEdit: (id: string) => void
}) {
  const weekStart = addDaysTo(mondayOf(new Date()), position.weekOffset * 7)
  const weekStartKey = localDateKey(weekStart)
  const weekEndKey = localDateKey(addDaysTo(weekStart, 6))

  const organizationNames = useMemo(
    () => new Map(organizations.map(organization => [organization.id, organization.name])),
    [organizations],
  )

  const { blocks, weekEventCount } = useMemo(function buildWeek() {
    const placed: TimetableEvent[] = []
    // One event can put a block on every day it runs; the badge counts events,
    // not blocks.
    const seen = new Set<string>()
    const firstDay = addDaysTo(mondayOf(new Date()), position.weekOffset * 7)
    for (const event of events) {
      const schedule = eventSchedule(event)
      // An event without a complete date and time cannot be placed on the grid.
      if (scheduleIssue(schedule)) continue
      const organizationName = organizationNames.get(event.organizationId) ?? "Unknown ministry"
      for (const block of eventOccurrences(event, weekStartKey, weekEndKey)) {
        const day = dayInWeek(block.date, firstDay)
        if (day < 0) continue
        seen.add(event.id)
        placed.push({
          id: `admin-${event.id}-${block.date}`,
          day,
          start: block.start,
          end: block.end,
          label: event.title,
          status: event.status,
          color: STATUS_COLOR[event.status],
          detail: organizationName,
          rows: [
            ["Ministry", organizationName],
            ["Location", event.location || "Not set"],
            ["Dates", formatEventDates(schedule)],
            ["Visibility", event.visibility === "public" ? "Public" : "Members only"],
            ["Capacity", `${event.capacity} ${event.capacity === 1 ? "attendee" : "attendees"}`],
            ...(event.registrationDeadline
              ? [["Registration closes", formatDeadline(event.registrationDeadline)] as [string, string]]
              : []),
          ],
          note: STATUS_NOTE[event.status],
          repeatsWeekly: event.recurrence === "weekly",
          repeatsMonthly: event.recurrence === "monthly",
          action: { label: "Edit event", onClick: () => onEdit(event.id) },
        })
      }
    }
    return { blocks: placed, weekEventCount: seen.size }
  }, [events, organizationNames, onEdit, position.weekOffset, weekEndKey, weekStartKey])

  const unscheduled = events.filter(event => scheduleIssue(eventSchedule(event)) !== null).length
  const legend = STATUS_LEGEND
    .filter(item => blocks.some(event => event.status === item.status))
    .map(item => ({ label: item.label, color: STATUS_COLOR[item.status] }))

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xl font-bold text-text">Schedule timeline</p>
          <p className="mt-1 text-sm text-muted">
            Every event on the days it runs. Tap a box for its details, or use this view to spot
            overlapping events.
          </p>
        </div>
        <p className="rounded-full bg-navy-soft px-3 py-1 text-xs font-bold text-navy">
          {weekEventCount === 1 ? "1 event this week" : `${weekEventCount} events this week`}
        </p>
      </div>

      <WeekNav
        weekOffset={position.weekOffset}
        weekStart={weekStart}
        onPositionChange={onPositionChange}
      />

      <WeeklyTimetable
        events={blocks}
        weekStart={weekStart}
        legend={legend}
        view={position.view}
        onViewChange={view => onPositionChange({ view })}
        dayIndex={position.dayIndex}
        onDayIndexChange={dayIndex => onPositionChange({ dayIndex })}
        detailsLabel="Event details"
      />

      {blocks.length === 0 && (
        <p className="mt-4 rounded-xl bg-bg p-4 text-center text-sm font-semibold text-muted">
          No events scheduled for this week. Use “Next ›” to look ahead.
        </p>
      )}

      {unscheduled > 0 && (
        <p className="mt-4 rounded-xl bg-gold-light p-4 text-sm font-semibold leading-relaxed text-gold">
          {unscheduled === 1 ? "1 event has" : `${unscheduled} events have`} no complete date and
          time yet, so {unscheduled === 1 ? "it is" : "they are"} not on the timeline. Edit the
          event to add its schedule.
        </p>
      )}
    </section>
  )
}
