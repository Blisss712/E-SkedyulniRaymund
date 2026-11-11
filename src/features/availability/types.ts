/** How the member's week is shown: the timetable grid or a day-by-day list. */

export type ScheduleMode = "timeline" | "list"

/** Where the availability timetable is looking. `dayIndex` is 0 = Monday … 6 = Sunday. */

export interface TimetablePosition {
  weekOffset: number // weeks from this week

  view: "week" | "day"

  dayIndex: number

  /** The member dashboard's schedule style; the administrator's timeline ignores it. */
  mode?: ScheduleMode
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
