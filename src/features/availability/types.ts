/** Where the availability timetable is looking. `dayIndex` is 0 = Monday … 6 = Sunday. */

export interface TimetablePosition {
  weekOffset: number // weeks from this week

  view: "week" | "day"

  dayIndex: number
}

export interface RecurringAvail {
  id: string

  days: string[]

  startTime: string

  endTime: string
}

export interface OneTimeOverride {
  id: string

  date: string

  type: "free" | "blocked"

  startTime?: string

  endTime?: string
}

export type AvailEditTarget = { kind: "recurring"; entry: RecurringAvail } | {
  kind: "override"
  entry: OneTimeOverride
}
