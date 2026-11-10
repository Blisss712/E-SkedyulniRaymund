import type { AdminEvent } from "./types"

/**
 * An event is described by two independent ranges:
 *
 *   • a date range  — the first and last day the event runs
 *   • a time range  — the time it runs on each of those days
 *
 * They are stored together in the database (`starts_at` / `ends_at`) because
 * that is what the schema and the reminders use, but the app must never treat
 * the pair as one continuous duration. A two-day event from 1:00 PM to 3:00 PM
 * runs 1–3 PM on both days, not for 26 hours straight.
 */
export type EventSchedule = {
  /** First day, `YYYY-MM-DD`. */
  startDate: string
  /** Last day, `YYYY-MM-DD`. */
  endDate: string
  /** Time the event starts on each day, `HH:MM`. */
  startTime: string
  /** Time the event ends on each day, `HH:MM`. */
  endTime: string
}

/** One block of a scheduled event, already placed on a specific day. */
export type EventOccurrence = {
  /** The day this block belongs to, `YYYY-MM-DD`. */
  date: string
  /** `HH:MM` */
  start: string
  /** `HH:MM` */
  end: string
}

type EventTiming = Pick<AdminEvent, "startsAt" | "endsAt" | "recurrence" | "repeatUntil">
type EventLike = Pick<AdminEvent, "startsAt" | "endsAt">

const DAY_MS = 86_400_000

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** `YYYY-MM-DDTHH:mm` -> the date and time halves, each safe to put in an input. */
export function splitDateTime(value: string): [string, string] {
  if (!value) return ["", ""]
  const [date = "", time = ""] = value.split("T")
  return [date, time.slice(0, 5)]
}

/** The inverse of `splitDateTime`; an incomplete pair stays empty. */
export function combineDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time.slice(0, 5)}` : ""
}

export function eventSchedule(event: EventLike): EventSchedule {
  const [startDate, startTime] = splitDateTime(event.startsAt)
  const [endDate, endTime] = splitDateTime(event.endsAt)
  return { startDate, endDate, startTime, endTime }
}

/** Why a schedule cannot be saved, or null when it is valid. */
export function scheduleIssue(schedule: EventSchedule): string | null {
  if (!schedule.startDate || !schedule.startTime || !schedule.endDate || !schedule.endTime) {
    return "Add the start and end date, and the start and end time."
  }
  if (schedule.endDate < schedule.startDate) {
    return "The end date cannot be before the start date."
  }
  if (schedule.endTime <= schedule.startTime) {
    return "The end time must be after the start time. Every day uses the same time range."
  }
  return null
}

/** True when two events share a day and their daily time ranges overlap. */
export function schedulesOverlap(a: EventSchedule, b: EventSchedule): boolean {
  const datesOverlap = a.startDate <= b.endDate && b.startDate <= a.endDate
  const timesOverlap = a.startTime < b.endTime && b.startTime < a.endTime
  return datesOverlap && timesOverlap
}

function utcDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`)
}

/** Adds days to a `YYYY-MM-DD` key without ever shifting across a timezone. */
export function addDaysToKey(dateKey: string, days: number): string {
  const date = utcDate(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string) {
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / DAY_MS)
}

/**
 * The visible blocks of an event inside `[windowStart, windowEnd]` (both
 * `YYYY-MM-DD`). A multi-day event contributes one block per day, each using
 * the same start and end time.
 */
export function eventOccurrences(
  event: EventTiming,
  windowStart: string,
  windowEnd: string,
): EventOccurrence[] {
  const schedule = eventSchedule(event)
  const { startDate, endDate, startTime, endTime } = schedule
  if (!startDate || !endDate || !startTime || !endTime) return []
  if (endDate < startDate || endTime <= startTime) return []
  if (windowEnd < windowStart) return []

  // The number of extra days the first occurrence covers, e.g. 1 for a
  // two-day event.
  const duration = daysBetween(startDate, endDate)
  const anchorDates: string[] = []

  if (event.recurrence === "none") {
    anchorDates.push(startDate)
  } else {
    // An occurrence that began before the window can still spill into it, so
    // start scanning that much earlier.
    const scanFrom = addDaysToKey(windowStart, -duration)
    // A recurring event with no "repeat until" keeps repeating.
    const until =
      event.repeatUntil && event.repeatUntil < windowEnd ? event.repeatUntil : windowEnd
    const first = scanFrom < startDate ? startDate : scanFrom

    if (until >= first) {
      const weekday = utcDate(startDate).getUTCDay()
      const dayOfMonth = utcDate(startDate).getUTCDate()
      for (let cursor = first; cursor <= until; cursor = addDaysToKey(cursor, 1)) {
        const date = utcDate(cursor)
        const matches =
          event.recurrence === "weekly"
            ? date.getUTCDay() === weekday
            : date.getUTCDate() === dayOfMonth
        if (matches) anchorDates.push(cursor)
      }
    }
  }

  const blocks: EventOccurrence[] = []
  for (const anchor of anchorDates) {
    for (let offset = 0; offset <= duration; offset += 1) {
      const date = addDaysToKey(anchor, offset)
      if (date < windowStart || date > windowEnd) continue
      blocks.push({ date, start: startTime, end: endTime })
    }
  }
  return blocks
}

/** `13:00` -> `1:00 PM`. */
export function formatClock(time: string): string {
  const [hour, minute] = time.split(":").map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time
  return `${hour % 12 || 12}:${pad(minute)} ${hour >= 12 ? "PM" : "AM"}`
}

/** `13:00`, `15:00` -> `1:00 PM – 3:00 PM`. */
export function formatTimeRange(start: string, end: string): string {
  if (!start || !end) return ""
  return `${formatClock(start)} – ${formatClock(end)}`
}

function formatDay(dateKey: string, withYear = true): string {
  const date = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date)
}

/** "Nov 9, 2026" for one day, "Nov 9 – Nov 11, 2026" for several. */
export function formatEventDates(schedule: EventSchedule): string {
  const { startDate, endDate } = schedule
  if (!startDate || !endDate) return "Date not set"
  if (startDate === endDate) return formatDay(startDate)
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4)
  return `${formatDay(startDate, !sameYear)} – ${formatDay(endDate)}`
}

/** A one-line summary for the admin lists: dates, times, and how often. */
export function formatEventWhen(event: EventTiming): string {
  const schedule = eventSchedule(event)
  if (!schedule.startDate || !schedule.endDate || !schedule.startTime || !schedule.endTime) {
    return "Schedule not set"
  }
  const repeats =
    event.recurrence === "weekly" ? " · Weekly" : event.recurrence === "monthly" ? " · Monthly" : ""
  return `${describeSchedule(schedule)}${repeats}`
}

/** "Nov 9 – Nov 11, 2026 · 1:00 PM – 3:00 PM on each day". */
export function describeSchedule(schedule: EventSchedule): string {
  const time = formatTimeRange(schedule.startTime, schedule.endTime)
  const daily = schedule.startDate === schedule.endDate ? "" : " on each day"
  return `${formatEventDates(schedule)} · ${time}${daily}`
}
