import type { RecurringAvail, OneTimeOverride } from "./types"

export const DAYS_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export const INITIAL_RECURRING: RecurringAvail[] = [
  { id: "r1", days: ["Sun"], startTime: "08:00", endTime: "12:00" },

  { id: "r2", days: ["Wed"], startTime: "18:00", endTime: "20:30" },
]

export const INITIAL_OVERRIDES: OneTimeOverride[] = [
  { id: "o1", date: "2026-09-28", type: "blocked" },

  {
    id: "o2",
    date: "2026-10-05",
    type: "free",
    startTime: "13:00",
    endTime: "17:00",
  },
]
