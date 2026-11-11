// SHARED CONTRACT: owned by Open Slots, but Availability depends on these too. Its timetable shows the

// slots marked "serving" and reads their `date` and `time`. Coordinate with the Availability team

// before changing anything here (field names, status values, or the "7:00 PM" time format).

export type SlotStatus = "open" | "serving" | "filled"

export interface Slot {
  id: string

  date: string

  time: string

  massName: string // e.g. "Sunday Mass"

  totalSpots: number

  filledSpots: number

  status: SlotStatus

  withinCutoff?: boolean

  /**
   * The event this slot was opened for. A slot opened from the admin or
   * coordinator workspace belongs to one specific upcoming event, so its
   * volunteers can be read as that event's volunteer list.
   */
  eventId?: string
}

/** "7:00 PM" (how slots store their time) → "19:00". */

export function slotTimeTo24h(time: string): string {
  const [clock, period] = time.split(" ")

  const [hour, minute] = clock.split(":").map(Number)

  let h = hour % 12

  if (period === "PM") h += 12

  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}
