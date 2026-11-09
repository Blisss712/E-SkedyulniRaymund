import { useEffect, useState } from "react"
import { useAuth } from "../auth/AuthContext"

import type {
  RecurringAvail,
  OneTimeOverride,
  TimetablePosition,
} from "./types"

import { DAYS_ORDER } from "./data"

import { Button, useSheetClose } from "../../shared/ui"

import { slotTimeTo24h, type Slot } from "../../shared/slot"

import {
  WeeklyTimetable,
  addDaysTo,
  mondayOf,
  type TimetableEvent,
} from "./timetable"

import {
  getMyAssignments,
  type Assignment,
} from "../../integration/assignments"
import type { AdminEvent } from "../admin/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTimeToState(
  time: string,
): { hour: number; minute: number; period: "AM" | "PM" } {
  const [h, m] = time.split(":").map(Number)

  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM"

  const hour = h % 12 || 12

  return { hour, minute: m, period }
}

function stateToTime(
  hour: number,
  minute: number,
  period: "AM" | "PM",
): string {
  let h = hour % 12

  if (period === "PM") h += 12

  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function formatTime(time: string): string {
  const { hour, minute, period } = parseTimeToState(time)

  return `${hour}:${String(minute).padStart(2, "0")} ${period}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

function isEndNotAfterStart(start: string, end: string): boolean {
  return end <= start
}

/** Adds minutes to an "HH:MM" time. */

function addMinutes(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number)

  const total = hour * 60 + minute + minutes

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/** Which timetable day (0 = Monday … 6 = Sunday) a "YYYY-MM-DD" date falls on in the week starting `weekStart`, or -1 if outside it. */

function dayInWeek(date: string, weekStart: Date): number {
  const day = Math.round(
    (new Date(date + "T12:00:00").getTime() - weekStart.getTime()) / 86_400_000,
  )

  return day >= 0 && day <= 6 ? day : -1
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Turns availability and serving (given by the group leader, or volunteered) into timetable blocks
 * for the week starting `weekStart` (a Monday). Weekly entries repeat every week; everything else
 * only shows in the week that contains its date.
 */

function availabilityEvents(
  recurring: RecurringAvail[],
  overrides: OneTimeOverride[],
  assignments: Assignment[],
  slots: Slot[],
  scheduledEvents: AdminEvent[],

  weekStart: Date,
  onViewSlot: (slot: Slot) => void,
): TimetableEvent[] {
  const events: TimetableEvent[] = []

  for (const entry of recurring) {
    for (const day of entry.days) {
      // DAYS_ORDER starts on Sunday; the timetable starts on Monday (0 = Monday … 6 = Sunday).

      events.push({
        id: `${entry.id}-${day}`,
        day: (DAYS_ORDER.indexOf(day) + 6) % 7,

        start: entry.startTime,
        end: entry.endTime,

        label: "Available",
        status: "available",
        color: "green",
        repeatsWeekly: true,
      })
    }
  }

  for (const entry of overrides) {
    const day = dayInWeek(entry.date, weekStart)

    if (day < 0) continue

    if (entry.type === "blocked") {
      events.push({
        id: entry.id,
        day,
        start: "00:00",
        end: "00:00",
        label: "Not available",
        status: "unavailable",
        color: "red",
        allDay: true,
      })
    } else if (entry.startTime && entry.endTime) {
      events.push({
        id: entry.id,
        day,
        start: entry.startTime,
        end: entry.endTime,
        label: "Available (one time)",
        status: "available",
        color: "green",
      })
    }
  }

  // Serving blocks have no end time, so each one is shown as one hour long.

  for (const assignment of assignments) {
    const day = dayInWeek(assignment.date, weekStart)

    if (day < 0) continue

    events.push({
      id: assignment.id,
      day,
      start: assignment.time,
      end: addMinutes(assignment.time, 60),

      label: "Serving · Assigned",
      status: "serving",
      color: "navy",
      detail: assignment.role,

      rows: [
        ["How", "Given by your group leader"],
        ["Role", assignment.role],
        ["Mass", assignment.massName],
      ],

      note: "To change this, please contact your group leader.",
    })
  }

  for (const slot of slots) {
    const day = dayInWeek(slot.date, weekStart)

    if (slot.status !== "serving" || day < 0) continue

    const start = slotTimeTo24h(slot.time)

    events.push({
      id: slot.id,
      day,
      start,
      end: addMinutes(start, 60),

      label: "Serving · Volunteered",
      status: "serving",
      color: "navy",
      detail: slot.massName,

      rows: [
        ["How", "You volunteered"],
        ["Mass", slot.massName],
      ],

      action: { label: "View my slot", onClick: () => onViewSlot(slot) },
    })
  }

  for (const event of scheduledEvents) {
    if (event.status !== "published") continue

    const start = new Date(event.startsAt)
    const end = new Date(event.endsAt)
    const repeatUntil = event.repeatUntil
      ? new Date(`${event.repeatUntil}T23:59:59`)
      : start
    const startDateKey = localDateKey(start)
    const repeatUntilDateKey = localDateKey(repeatUntil)
    const cursor = new Date(weekStart)

    for (let day = 0; day < 7; day += 1) {
      const date = new Date(cursor)
      date.setDate(cursor.getDate() + day)
      const sameDay =
        event.recurrence === "weekly"
          ? date.getDay() === start.getDay()
          : event.recurrence === "monthly"
            ? date.getDate() === start.getDate()
            : localDateKey(date) === startDateKey

      if (
        !sameDay ||
        localDateKey(date) > repeatUntilDateKey ||
        localDateKey(date) < startDateKey
      )
        continue

      const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
      const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`

      events.push({
        id: `scheduled-${event.id}-${date.toISOString().slice(0, 10)}`,
        day,
        start: startTime,
        end: endTime,
        label: event.title,
        status: "serving",
        color: "navy",
        detail: event.location,
        rows: [
          ["Organization", event.organizationId],
          ["Visibility", event.visibility === "public" ? "Public" : "Members only"],
        ],
        note: "Published schedule",
      })
    }
  }

  return events
}

// ─── Time Picker ──────────────────────────────────────────────────────────────

function TimePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  const parsed = parseTimeToState(value)

  const [selHour, setSelHour] = useState(parsed.hour)

  const [selMinute, setSelMinute] = useState(parsed.minute)

  const [selPeriod, setSelPeriod] = useState<"AM" | "PM">(parsed.period)

  const { closing, close } = useSheetClose()

  function handleOpen() {
    const s = parseTimeToState(value)

    setSelHour(s.hour)
    setSelMinute(s.minute)
    setSelPeriod(s.period)

    setOpen(true)
  }

  function handleDone() {
    onChange(stateToTime(selHour, selMinute, selPeriod))

    close(() => setOpen(false))
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <label className="text-[#1A202C] font-semibold text-[17px]">
          {label}
        </label>
        <button
          onClick={handleOpen}
          className="w-full min-h-[56px] px-5 rounded-xl border-2 border-[#D1D9E8] bg-white text-[#1A202C] text-[18px] font-semibold flex items-center justify-between hover:border-[#1B3A6B] transition-colors cursor-pointer"
          aria-label={`${label}: ${formatTime(value)}. Tap to change.`}
        >
          <span>{formatTime(value)}</span>
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="11"
              cy="11"
              r="9.5"
              stroke="#64748B"
              strokeWidth="1.75"
            />
            <path
              d="M11 7v4.5l3.5 2"
              stroke="#64748B"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          data-closing={closing}
        >
          <div
            className="sheet-backdrop absolute inset-0 bg-black/50"
            onClick={() => close(() => setOpen(false))}
            aria-hidden="true"
          />
          <div className="sheet-panel relative bg-white rounded-t-3xl px-5 pt-4 pb-8 shadow-2xl">
            <div className="w-10 h-1.5 bg-[#D1D9E8] rounded-full mx-auto mb-4" />
            <h3 className="text-[19px] font-bold text-[#1B3A6B] mb-5">
              {label}
            </h3>
            <div className="flex gap-3 mb-6">
              <div className="flex-1 flex flex-col gap-2">
                <p className="text-[#64748B] text-[13px] font-semibold text-center uppercase tracking-wide">
                  Hour
                </p>
                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                    <button
                      key={h}
                      onClick={() => setSelHour(h)}
                      className={`w-full min-h-[52px] rounded-xl text-[20px] font-bold transition-all ${
                        selHour === h
                          ? "bg-[#1B3A6B] text-white shadow-sm"
                          : "bg-[#F4F6FB] text-[#1A202C] hover:bg-[#E8EDF7]"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <p className="text-[#64748B] text-[13px] font-semibold text-center uppercase tracking-wide">
                  Minute
                </p>
                <div className="flex flex-col gap-1.5">
                  {[0, 15, 30, 45].map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelMinute(m)}
                      className={`w-full min-h-[52px] rounded-xl text-[20px] font-bold transition-all ${
                        selMinute === m
                          ? "bg-[#1B3A6B] text-white shadow-sm"
                          : "bg-[#F4F6FB] text-[#1A202C] hover:bg-[#E8EDF7]"
                      }`}
                    >
                      {String(m).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <p className="text-[#64748B] text-[13px] font-semibold text-center uppercase tracking-wide">
                  Period
                </p>
                <div className="flex flex-col gap-1.5">
                  {(["AM", "PM"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setSelPeriod(p)}
                      className={`w-full min-h-[52px] rounded-xl text-[20px] font-bold transition-all ${
                        selPeriod === p
                          ? "bg-[#1B3A6B] text-white shadow-sm"
                          : "bg-[#F4F6FB] text-[#1A202C] hover:bg-[#E8EDF7]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={handleDone}
              className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl text-[17px] font-semibold hover:bg-[#142d54] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function DayChips({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (days: string[]) => void
}) {
  function toggle(day: string) {
    onChange(
      selected.includes(day)
        ? selected.filter((d) => d !== day)
        : [...selected, day],
    )
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {DAYS_ORDER.map((day) => (
        <button
          key={day}
          onClick={() => toggle(day)}
          aria-pressed={selected.includes(day)}
          className={`flex-1 min-w-[44px] min-h-[56px] rounded-xl text-[15px] font-bold transition-all ${
            selected.includes(day)
              ? "bg-[#1B3A6B] text-white shadow-sm"
              : "bg-white border-2 border-[#D1D9E8] text-[#64748B] hover:border-[#1B3A6B] hover:text-[#1B3A6B]"
          }`}
        >
          {day}
        </button>
      ))}
    </div>
  )
}

function TimeRangePicker({
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  error,
}: {
  startTime: string
  endTime: string

  onStartChange: (v: string) => void
  onEndChange: (v: string) => void

  error?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <TimePicker
        label="Start time"
        value={startTime}
        onChange={onStartChange}
      />
      <TimePicker label="End time" value={endTime} onChange={onEndChange} />
      {error && (
        <div
          role="alert"
          className="bg-[#FDEDEC] border border-[#C0392B]/30 rounded-xl px-4 py-3 flex items-center gap-2"
        >
          <span className="text-[#C0392B] text-[20px]" aria-hidden="true">
            ⚠
          </span>
          <p className="text-[#C0392B] text-[15px] font-medium">{error}</p>
        </div>
      )}
    </div>
  )
}

function ConfirmRemoveModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  const { closing, close } = useSheetClose()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      data-closing={closing}
    >
      <div
        className="sheet-backdrop absolute inset-0 bg-black/50"
        onClick={() => close(onCancel)}
        aria-hidden="true"
      />
      <div className="sheet-panel relative bg-white rounded-t-3xl px-6 pt-6 pb-10 w-full max-w-lg shadow-2xl">
        <div className="w-10 h-1.5 bg-[#D1D9E8] rounded-full mx-auto mb-5" />
        <h3 className="text-[19px] font-bold text-[#1A202C] mb-3">
          Remove this availability?
        </h3>
        <p className="text-[#64748B] text-[16px] leading-relaxed mb-6">
          This will remove the entry from your availability. You can always add
          it back later.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => close(onConfirm)}
            className="w-full min-h-[56px] rounded-xl text-[17px] font-semibold transition-colors bg-[#C0392B] text-white hover:bg-[#a93226]"
          >
            Yes, remove it
          </button>
          <button
            onClick={() => close(onCancel)}
            className="w-full min-h-[56px] rounded-xl text-[17px] font-semibold bg-[#F4F6FB] text-[#1B3A6B] hover:bg-[#E8EDF7] transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  )
}

function RecurringEntryCard({
  entry,
  onEdit,
  onRemove,
}: {
  entry: RecurringAvail
  onEdit: () => void
  onRemove: () => void
}) {
  const sortedDays = [...entry.days].sort(
    (a, b) => DAYS_ORDER.indexOf(a) - DAYS_ORDER.indexOf(b),
  )

  return (
    <div className="bg-white border border-[#D1D9E8] rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {sortedDays.map((d) => (
              <span
                key={d}
                className="bg-[#1B3A6B]/10 text-[#1B3A6B] text-[13px] font-bold px-2.5 py-0.5 rounded-full"
              >
                {d}
              </span>
            ))}
          </div>
          <p className="text-[#1A202C] text-[17px] font-semibold">
            {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
          </p>
        </div>
      </div>
      <div className="flex gap-2 pt-3 border-t border-[#F4F6FB]">
        <button
          onClick={onEdit}
          className="flex-1 min-h-[44px] rounded-xl border-2 border-[#1B3A6B] text-[#1B3A6B] text-[15px] font-semibold hover:bg-[#F4F6FB] transition-colors cursor-pointer"
        >
          Edit
        </button>
        <button
          onClick={onRemove}
          className="flex-1 min-h-[44px] rounded-xl border-2 border-[#D1D9E8] text-[#64748B] text-[15px] font-semibold hover:border-[#C0392B] hover:text-[#C0392B] transition-colors cursor-pointer"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function OverrideEntryCard({
  entry,
  onEdit,
  onRemove,
}: {
  entry: OneTimeOverride
  onEdit: () => void
  onRemove: () => void
}) {
  const isFree = entry.type === "free"

  return (
    <div
      className={`border rounded-2xl p-4 ${
        isFree
          ? "bg-[#E8F5EE] border-[#2D7A4F]/25"
          : "bg-[#FDEDEC] border-[#C0392B]/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[13px] font-bold px-2.5 py-0.5 rounded-full ${
                isFree
                  ? "bg-[#2D7A4F]/15 text-[#2D7A4F]"
                  : "bg-[#C0392B]/15 text-[#C0392B]"
              }`}
            >
              {isFree ? "Extra free time" : "Not available"}
            </span>
          </div>
          <p className="text-[#1A202C] text-[17px] font-semibold">
            {formatDate(entry.date)}
          </p>
          {isFree && entry.startTime && (
            <p className="text-[#64748B] text-[15px] mt-0.5">
              {formatTime(entry.startTime)} – {formatTime(entry.endTime!)}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 pt-3 border-t border-black/5">
        <button
          onClick={onEdit}
          className="flex-1 min-h-[44px] rounded-xl border-2 border-[#1B3A6B] text-[#1B3A6B] text-[15px] font-semibold hover:bg-white/60 transition-colors cursor-pointer"
        >
          Edit
        </button>
        <button
          onClick={onRemove}
          className="flex-1 min-h-[44px] rounded-xl border-2 border-[#D1D9E8] bg-white/50 text-[#64748B] text-[15px] font-semibold hover:border-[#C0392B] hover:text-[#C0392B] transition-colors cursor-pointer"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

// ─── Full schedule ────────────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M3 10h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function WeekNav({
  weekOffset,
  weekStart,
  onPositionChange,
}: {
  weekOffset: number

  weekStart: Date

  onPositionChange: (change: Partial<TimetablePosition>) => void
}) {
  const weekEnd = addDaysTo(weekStart, 6)

  return (
    <>
      <div className="my-4 grid grid-cols-3 gap-1">
        <Button
          variant="ghost"
          size="compact"
          onClick={() => onPositionChange({ weekOffset: weekOffset - 1 })}
          ariaLabel="Previous week"
        >
          ‹ Previous
        </Button>
        <Button
          variant={weekOffset === 0 ? "secondary" : "ghost"}
          size="compact"
          onClick={() => onPositionChange({ weekOffset: 0 })}
          className="whitespace-nowrap"
        >
          This Week
        </Button>
        <Button
          variant="ghost"
          size="compact"
          onClick={() => onPositionChange({ weekOffset: weekOffset + 1 })}
          ariaLabel="Next week"
        >
          Next ›
        </Button>
      </div>
      <p className="mb-4 text-center text-[19px] font-extrabold text-[#1B3A6B]">
        {weekStart.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
        })}{" "}
        –{" "}
        {weekEnd.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
    </>
  )
}

/** The whole timetable on its own full-screen page, where it can scroll. */

function FullScheduleDialog({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Keep the home page behind the dialog from scrolling while it's open.

  useEffect(() => {
    const html = document.documentElement

    const previous = [html.style.overflow, document.body.style.overflow]

    html.style.overflow = "hidden"

    document.body.style.overflow = "hidden"

    return () => {
      ;[html.style.overflow, document.body.style.overflow] = previous
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[#F4F6FB]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-schedule-title"
    >
      <div
        className="bg-[#1B3A6B] px-4 pb-3 text-white"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <h2 id="full-schedule-title" className="text-2xl font-extrabold">
            My Schedule
          </h2>
          <button
            onClick={onClose}
            className="flex min-h-[56px] shrink-0 items-center gap-2 rounded-xl bg-white px-5 text-[19px] font-bold text-[#1B3A6B] hover:bg-[#E8EDF7]"
          >
            <span className="text-[22px] leading-none" aria-hidden="true">
              ✕
            </span>{" "}
            Close
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-3">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
          {children}
        </div>
      </div>

      <div
        className="border-t border-[#D1D9E8] bg-white px-4 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={onClose}
          className="mx-auto flex min-h-[60px] w-full max-w-lg items-center justify-center rounded-xl bg-[#1B3A6B] text-[20px] font-bold text-white hover:bg-[#142d54]"
        >
          Close
        </button>
      </div>

      {/* Android back button: the app's @capacitor/app backButton listener (shared/native.ts) closes the top-most
          pop-up by clicking its backdrop. This hidden one is last, so an event pop-up inside closes before the dialog. */}
      <div hidden aria-hidden="true" onClick={onClose} />
    </div>
  )
}

// ─── Availability Tab (Home) ──────────────────────────────────────────────────

export function AvailabilityTab({
  recurringEntries,
  overrides,
  slots,
  scheduledEvents,
  position,
  onPositionChange,

  onAddRecurring,
  onAddOverride,
  onEditRecurring,
  onEditOverride,

  onRemoveRecurring,
  onRemoveOverride,
  error,
  onViewSlot, // the ones marked "serving" (volunteered) show on the timetable
}: {
  recurringEntries: RecurringAvail[]

  overrides: OneTimeOverride[]

  slots: Slot[]

  scheduledEvents: AdminEvent[]

  position: TimetablePosition

  onPositionChange: (change: Partial<TimetablePosition>) => void

  onAddRecurring: () => void

  onAddOverride: () => void

  onEditRecurring: (e: RecurringAvail) => void

  onEditOverride: (e: OneTimeOverride) => void

  onRemoveRecurring: (id: string) => void

  onRemoveOverride: (id: string) => void

  error?: string

  onViewSlot: (slot: Slot) => void
}) {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentError, setAssignmentError] = useState("")
  const [confirmRemove, setConfirmRemove] = useState<{
    kind: "recurring" | "override"
    id: string
  } | null>(null)

  const [showFullSchedule, setShowFullSchedule] = useState(false)

  const { weekOffset } = position

  const weekStart = addDaysTo(mondayOf(new Date()), weekOffset * 7)

  useEffect(() => {
    let active = true
    getMyAssignments(user?.id).then((next) => {
      if (active) {
        setAssignments(next)
        setAssignmentError("")
      }
    }).catch((reason: unknown) => {
      if (!active) return
      console.error("Unable to load assignments:", reason)
      setAssignmentError(reason instanceof Error ? reason.message : "Unable to load assignments.")
    })
    return () => {
      active = false
    }
  }, [user?.id])

  // The preview and the full schedule show the same data, week and view.

  const timetableProps = {
    events: availabilityEvents(
      recurringEntries,
      overrides,
      assignments,
      slots,
      scheduledEvents,
      weekStart,
      onViewSlot,
    ),

    weekStart,

    legend: [
      { label: "Available", color: "green" as const },
      { label: "Not available", color: "red" as const },
      { label: "Serving", color: "navy" as const },
    ],

    view: position.view,

    onViewChange: (view: TimetablePosition["view"]) =>
      onPositionChange({ view }),

    dayIndex: position.dayIndex,

    onDayIndexChange: (dayIndex: number) => onPositionChange({ dayIndex }),
  }

  const isEmpty = recurringEntries.length === 0 && overrides.length === 0

  function doRemove() {
    if (!confirmRemove) return

    if (confirmRemove.kind === "recurring") onRemoveRecurring(confirmRemove.id)
    else onRemoveOverride(confirmRemove.id)

    setConfirmRemove(null)
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-[#C0392B]">
          {error}
        </p>
      )}
      {assignmentError && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-[#C0392B]">
          {assignmentError}
        </p>
      )}
      <p className="text-2xl font-extrabold text-[#1B3A6B]">
        My Availability This Week
      </p>
      <p className="mt-1 text-[17px] leading-relaxed text-[#64748B]">
        Green boxes show when you're free. Red boxes show when you're not
        available. Navy boxes are when you're serving.
      </p>

      <WeekNav
        weekOffset={weekOffset}
        weekStart={weekStart}
        onPositionChange={onPositionChange}
      />

      {/* A still preview only: swiping over it scrolls the page, tapping it opens the full schedule. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Open your full schedule"
        onClick={() => setShowFullSchedule(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()

            setShowFullSchedule(true)
          }
        }}
        className="cursor-pointer rounded-2xl"
      >
        <WeeklyTimetable {...timetableProps} layout="preview" />
      </div>

      <button
        onClick={() => setShowFullSchedule(true)}
        className="mt-4 flex min-h-[60px] w-full items-center justify-center gap-3 rounded-xl bg-[#1B3A6B] px-4 text-[20px] font-bold text-white hover:bg-[#142d54] transition-colors"
      >
        <CalendarIcon /> See full schedule
      </button>

      {showFullSchedule && (
        <FullScheduleDialog onClose={() => setShowFullSchedule(false)}>
          <WeekNav
            weekOffset={weekOffset}
            weekStart={weekStart}
            onPositionChange={onPositionChange}
          />
          <WeeklyTimetable {...timetableProps} layout="full" />
        </FullScheduleDialog>
      )}

      {!isEmpty && (
        <div className="mx-auto mt-6 flex max-w-lg flex-col gap-2">
          <button
            onClick={onAddRecurring}
            className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl text-[17px] font-semibold flex items-center justify-center gap-2 hover:bg-[#142d54] transition-colors"
          >
            <span className="text-[22px] leading-none">+</span> Add availability
          </button>
          <button
            onClick={onAddOverride}
            className="w-full min-h-[48px] border-2 border-[#D1D9E8] text-[#64748B] bg-white rounded-xl text-[15px] font-semibold hover:border-[#1B3A6B] hover:text-[#1B3A6B] transition-colors"
          >
            Add a one-time date
          </button>
        </div>
      )}

      <div className="mt-8">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-[#1B3A6B]/08 flex items-center justify-center">
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="5"
                  y="8"
                  width="30"
                  height="27"
                  rx="3"
                  stroke="#1B3A6B"
                  strokeWidth="2"
                  fill="none"
                  opacity="0.4"
                />
                <path
                  d="M5 15h30"
                  stroke="#1B3A6B"
                  strokeWidth="2"
                  opacity="0.4"
                />
                <path
                  d="M13 5v6M27 5v6"
                  stroke="#1B3A6B"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.4"
                />
                <path
                  d="M20 22v8M16 26h8"
                  stroke="#1B3A6B"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <p className="text-[#1A202C] font-bold text-[20px] mb-2">
                You haven't set your availability yet
              </p>
              <p className="text-[#64748B] text-[16px] leading-relaxed max-w-xs mx-auto">
                Let your coordinator know when you're free so they know when to
                ask you to serve.
              </p>
            </div>
            <div className="w-full flex flex-col gap-3">
              <button
                onClick={onAddRecurring}
                className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl text-[17px] font-semibold hover:bg-[#142d54] transition-colors"
              >
                Set my weekly availability
              </button>
              <button
                onClick={onAddOverride}
                className="w-full min-h-[56px] border-2 border-[#1B3A6B] text-[#1B3A6B] bg-white rounded-xl text-[17px] font-semibold hover:bg-[#F4F6FB] transition-colors"
              >
                Add a one-time date
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {recurringEntries.length > 0 && (
              <div>
                <h2 className="text-[13px] font-bold text-[#64748B] uppercase tracking-widest mb-3">
                  Weekly Pattern
                </h2>
                <div className="flex flex-col gap-3">
                  {recurringEntries.map((e) => (
                    <RecurringEntryCard
                      key={e.id}
                      entry={e}
                      onEdit={() => onEditRecurring(e)}
                      onRemove={() =>
                        setConfirmRemove({ kind: "recurring", id: e.id })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            {overrides.length > 0 && (
              <div>
                <h2 className="text-[13px] font-bold text-[#64748B] uppercase tracking-widest mb-3">
                  One-Time Dates
                </h2>
                <div className="flex flex-col gap-3">
                  {overrides.map((e) => (
                    <OverrideEntryCard
                      key={e.id}
                      entry={e}
                      onEdit={() => onEditOverride(e)}
                      onRemove={() =>
                        setConfirmRemove({ kind: "override", id: e.id })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmRemove && (
        <ConfirmRemoveModal
          onConfirm={doRemove}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  )
}

// ─── Set Recurring Screen ─────────────────────────────────────────────────────

export function SetRecurringScreen({
  initial,
  onSave,
  onBack,
}: {
  initial?: RecurringAvail
  onSave: (e: RecurringAvail) => Promise<{ ok: boolean; message?: string }>
  onBack: () => void
}) {
  const [days, setDays] = useState<string[]>(initial?.days ?? [])

  const [startTime, setStartTime] = useState(initial?.startTime ?? "09:00")

  const [endTime, setEndTime] = useState(initial?.endTime ?? "12:00")

  const [errors, setErrors] = useState<{ days?: string; time?: string }>({})
  const [saveError, setSaveError] = useState("")

  async function handleSave() {
    const e: { days?: string; time?: string } = {}

    if (days.length === 0) e.days = "Please select at least one day."

    if (isEndNotAfterStart(startTime, endTime))
      e.time = "End time must be after start time."

    if (Object.keys(e).length) {
      setErrors(e)
      return
    }

    const result = await onSave({ id: initial?.id ?? `r-${Date.now()}`, days, startTime, endTime })
    setSaveError(result.ok ? "" : result.message ?? "Unable to save availability.")
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex flex-col">
      <div className="bg-[#1B3A6B] text-white px-4 pt-10 pb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-white/70 text-[15px] font-medium mb-3 hover:text-white transition-colors cursor-pointer"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M11 4L6 9l5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          My Availability
        </button>
        <h1 className="text-[22px] font-bold">
          {initial ? "Edit Weekly Availability" : "Set Weekly Availability"}
        </h1>
        <p className="text-white/60 text-[15px] mt-1">
          Choose the days and times you're usually free.
        </p>
      </div>

      <div className="flex-1 px-4 py-6 flex flex-col gap-6 overflow-y-auto pb-32">
        <div className="bg-white rounded-2xl border border-[#D1D9E8] p-5">
          <label className="text-[#1A202C] font-bold text-[17px] block mb-3">
            Which days are you free?
          </label>
          {errors.days && (
            <div
              role="alert"
              className="bg-[#FDEDEC] border border-[#C0392B]/30 rounded-xl px-4 py-3 flex items-center gap-2 mb-3"
            >
              <span className="text-[#C0392B] text-[18px]" aria-hidden="true">
                ⚠
              </span>
              <p className="text-[#C0392B] text-[15px] font-medium">
                {errors.days}
              </p>
            </div>
          )}
          <DayChips
            selected={days}
            onChange={(d) => {
              setDays(d)
              setErrors((prev) => ({ ...prev, days: undefined }))
            }}
          />
        </div>

        {days.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#D1D9E8] p-5">
            <label className="text-[#1A202C] font-bold text-[17px] block mb-4">
              What time are you free{days.length > 1 ? " on these days" : ""}?
            </label>
            <TimeRangePicker
              startTime={startTime}
              endTime={endTime}
              onStartChange={(v) => {
                setStartTime(v)
                setErrors((prev) => ({ ...prev, time: undefined }))
              }}
              onEndChange={(v) => {
                setEndTime(v)
                setErrors((prev) => ({ ...prev, time: undefined }))
              }}
              error={errors.time}
            />
          </div>
        )}

        <div className="bg-[#EFF6FF] border border-[#2563EB]/20 rounded-xl p-4 flex gap-3">
          <span className="text-[#2563EB] text-[20px] flex-shrink-0">ℹ</span>
          <p className="text-[#1A202C] text-[15px] leading-relaxed">
            This sets a <strong>weekly repeating pattern</strong>. For a single
            special date, use "Add a one-time date" instead.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#D1D9E8] px-4 py-4 max-w-lg mx-auto">
        {saveError && <p role="alert" className="mb-2 text-sm font-medium text-[#C0392B]">{saveError}</p>}
        <button
          onClick={handleSave}
          className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl text-[17px] font-semibold hover:bg-[#142d54] transition-colors"
        >
          {initial ? "Save changes" : "Save"}
        </button>
      </div>
    </div>
  )
}

// ─── Add Override Screen ──────────────────────────────────────────────────────

export function AddOverrideScreen({
  initial,
  onSave,
  onBack,
}: {
  initial?: OneTimeOverride
  onSave: (e: OneTimeOverride) => Promise<{ ok: boolean; message?: string }>
  onBack: () => void
}) {
  const today = new Date().toISOString().split("T")[0]

  const [date, setDate] = useState(initial?.date ?? today)

  const [type, setType] = useState<"free" | "blocked" | null>(
    initial?.type ?? null,
  )

  const [startTime, setStartTime] = useState(initial?.startTime ?? "13:00")

  const [endTime, setEndTime] = useState(initial?.endTime ?? "17:00")

  const [errors, setErrors] = useState<{
    date?: string
    type?: string
    time?: string
  }>({})
  const [saveError, setSaveError] = useState("")

  async function handleSave() {
    const e: typeof errors = {}

    if (!date) e.date = "Please choose a date."

    if (!type) e.type = "Please choose one of the options below."

    if (type === "free" && isEndNotAfterStart(startTime, endTime))
      e.time = "End time must be after start time."

    if (Object.keys(e).length) {
      setErrors(e)
      return
    }

    const result = await onSave({
      id: initial?.id ?? `o-${Date.now()}`,
      date,
      type: type!,
      startTime: type === "free" ? startTime : undefined,
      endTime: type === "free" ? endTime : undefined,
    })
    setSaveError(result.ok ? "" : result.message ?? "Unable to save availability.")
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex flex-col">
      <div className="bg-[#1B3A6B] text-white px-4 pt-10 pb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-white/70 text-[15px] font-medium mb-3 hover:text-white transition-colors cursor-pointer"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M11 4L6 9l5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          My Availability
        </button>
        <h1 className="text-[22px] font-bold">
          {initial ? "Edit One-Time Date" : "Add a One-Time Date"}
        </h1>
        <p className="text-white/60 text-[15px] mt-1">
          For a specific day that's different from your usual schedule.
        </p>
      </div>

      <div className="flex-1 px-4 py-6 flex flex-col gap-5 overflow-y-auto pb-32">
        <div className="bg-white rounded-2xl border border-[#D1D9E8] p-5">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="override-date"
              className="text-[#1A202C] font-bold text-[17px]"
            >
              Which date?
            </label>
            {errors.date && (
              <p
                role="alert"
                className="text-[#C0392B] text-[15px] font-medium flex items-center gap-1"
              >
                <span aria-hidden="true">⚠</span> {errors.date}
              </p>
            )}
            <input
              id="override-date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => {
                setDate(e.target.value)
                setErrors((prev) => ({ ...prev, date: undefined }))
              }}
              className={`w-full min-h-[56px] px-4 text-[18px] font-semibold rounded-xl border-2 bg-white text-[#1A202C] focus:outline-none focus:border-[#1B3A6B] transition-colors ${
                errors.date ? "border-[#C0392B]" : "border-[#D1D9E8]"
              }`}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#D1D9E8] p-5">
          <p className="text-[#1A202C] font-bold text-[17px] mb-2">
            What's different on this day?
          </p>
          {errors.type && (
            <div
              role="alert"
              className="bg-[#FDEDEC] border border-[#C0392B]/30 rounded-xl px-4 py-3 flex items-center gap-2 mb-3"
            >
              <span className="text-[#C0392B] text-[18px]" aria-hidden="true">
                ⚠
              </span>
              <p className="text-[#C0392B] text-[15px] font-medium">
                {errors.type}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setType("free")
                setErrors((prev) => ({ ...prev, type: undefined }))
              }}
              aria-pressed={type === "free"}
              className={`w-full min-h-[72px] rounded-2xl border-2 text-left px-5 flex items-center gap-4 transition-all ${
                type === "free"
                  ? "border-[#2D7A4F] bg-[#E8F5EE]"
                  : "border-[#D1D9E8] bg-white hover:border-[#9BA8C0]"
              }`}
            >
              <span className="text-[28px] flex-shrink-0">🟢</span>
              <div>
                <p
                  className={`font-bold text-[16px] ${
                    type === "free" ? "text-[#2D7A4F]" : "text-[#1A202C]"
                  }`}
                >
                  I'm free extra hours this day
                </p>
                <p className="text-[#64748B] text-[14px]">
                  You have time outside your usual schedule
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                setType("blocked")
                setErrors((prev) => ({ ...prev, type: undefined }))
              }}
              aria-pressed={type === "blocked"}
              className={`w-full min-h-[72px] rounded-2xl border-2 text-left px-5 flex items-center gap-4 transition-all ${
                type === "blocked"
                  ? "border-[#C0392B] bg-[#FDEDEC]"
                  : "border-[#D1D9E8] bg-white hover:border-[#9BA8C0]"
              }`}
            >
              <span className="text-[28px] flex-shrink-0">🔴</span>
              <div>
                <p
                  className={`font-bold text-[16px] ${
                    type === "blocked" ? "text-[#C0392B]" : "text-[#1A202C]"
                  }`}
                >
                  I'm not available this day
                </p>
                <p className="text-[#64748B] text-[14px]">
                  You can't make it, even during your usual hours
                </p>
              </div>
            </button>
          </div>
        </div>

        {type === "free" && (
          <div className="bg-white rounded-2xl border border-[#D1D9E8] p-5">
            <p className="text-[#1A202C] font-bold text-[17px] mb-4">
              What time are you free?
            </p>
            <TimeRangePicker
              startTime={startTime}
              endTime={endTime}
              onStartChange={(v) => {
                setStartTime(v)
                setErrors((prev) => ({ ...prev, time: undefined }))
              }}
              onEndChange={(v) => {
                setEndTime(v)
                setErrors((prev) => ({ ...prev, time: undefined }))
              }}
              error={errors.time}
            />
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#D1D9E8] px-4 py-4 max-w-lg mx-auto">
        {saveError && <p role="alert" className="mb-2 text-sm font-medium text-[#C0392B]">{saveError}</p>}
        <button
          onClick={handleSave}
          className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl text-[17px] font-semibold hover:bg-[#142d54] transition-colors"
        >
          {initial ? "Save changes" : "Save override"}
        </button>
      </div>
    </div>
  )
}
