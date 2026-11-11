import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"

import { Button, useSheetClose } from "../../shared/ui"

import type { TimetablePosition } from "./types"

// ─── Types ────────────────────────────────────────────────────────────────────

type TimetableColor = "green" | "red" | "navy" | "gold"

/** What a block means. The administrator's event timeline uses an event's own status. */

type TimetableStatus =
  | "available"
  | "unavailable"
  | "serving"
  | "event"
  | "draft"
  | "published"
  | "cancelled"
  | "completed"

/** One block on the weekly timetable. `day` is 0 = Monday … 6 = Sunday. */

export interface TimetableEvent {
  id: string

  day: number

  start: string // "HH:MM" 24-hour

  end: string // "HH:MM" 24-hour

  label: string // e.g. "Available"

  status: TimetableStatus

  color: TimetableColor

  detail?: string // third line on the box when there's room, e.g. "Lector" or "Sunday Mass"

  rows?: Array<[string, string]> // extra pop-up rows, shown after Status

  note?: string // message at the bottom of the pop-up

  repeatsWeekly?: boolean

  repeatsMonthly?: boolean

  allDay?: boolean // fills the whole visible day; start/end are ignored

  action?: { label: string; onClick: () => void } // big button in the details pop-up
}

const STATUS_TEXT: Record<TimetableStatus, string> = {
  available: "Available",

  unavailable: "Not available",

  serving: "Serving",

  event: "Event",

  draft: "Draft",

  published: "Published",

  cancelled: "Cancelled",

  completed: "Completed",
}

// ─── Constants & helpers ──────────────────────────────────────────────────────

const HOUR_HEIGHT = 88 // px per hour — tall enough for large text

const DAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// Colors picked from the app theme; every text/background pair passes WCAG AA.

const TIMETABLE_COLORS: Record<TimetableColor, {
  block: string
  swatch: string
}> = {
  green: {
    block: "bg-[#E8F5EE] text-[#1F5A39] border-[#2D7A4F]",
    swatch: "bg-[#E8F5EE] border-2 border-[#2D7A4F]",
  },

  red: {
    block: "bg-[#FDEDEC] text-[#C0392B] border-[#C0392B]",
    swatch: "bg-[#FDEDEC] border-2 border-[#C0392B]",
  },

  navy: {
    block: "bg-[#1B3A6B] text-white border-[#142d54]",
    swatch: "bg-[#1B3A6B]",
  },

  gold: {
    block: "bg-[#FEF3DC] text-[#6B4A0B] border-[#C9921A]",
    swatch: "bg-[#FEF3DC] border-2 border-[#C9921A]",
  },
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number)

  return hour * 60 + minute
}

function formatClock(time: string) {
  const [hour, minute] = time.split(":").map(Number)

  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`
}

/** "7:45–8:45 AM" when both times share AM/PM, otherwise "11:00 AM–12:00 PM". */

function formatRange(start: string, end: string) {
  const a = formatClock(start)

  const b = formatClock(end)

  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12}:00 ${hour >= 12 && hour < 24 ? "PM" : "AM"}`
}

/**
 * Which timetable day (0 = Monday … 6 = Sunday) a `YYYY-MM-DD` date falls on in
 * the week starting `weekStart`, or -1 when it is outside that week.
 */

export function dayInWeek(date: string, weekStart: Date): number {
  const day = Math.round(
    (new Date(date + "T12:00:00").getTime() - weekStart.getTime()) / 86_400_000,
  )

  return day >= 0 && day <= 6 ? day : -1
}

/** A local `YYYY-MM-DD` key, so a date never shifts across a timezone. */

export function localDateKey(date: Date): string {
  const year = date.getFullYear()

  const month = String(date.getMonth() + 1).padStart(2, "0")

  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function mondayOf(date: Date) {
  const next = new Date(date)

  next.setHours(12, 0, 0, 0)

  const day = next.getDay()

  next.setDate(next.getDate() - (day === 0 ? 6 : day - 1))

  return next
}

export function addDaysTo(date: Date, amount: number) {
  const next = new Date(date)

  next.setDate(next.getDate() + amount)

  return next
}

/**
 * Previous / This Week / Next and the week's date range. Both the member's
 * availability and the administrator's event timeline use it, so moving between
 * weeks looks and behaves the same everywhere.
 */

export function WeekNav({
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

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Splits overlapping events on the same day into side-by-side lanes. */

function layoutDay(events: TimetableEvent[]) {
  const sorted = [...events].sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start),
  )

  const placed: Array<{
    event: TimetableEvent
    lane: number
    lanes: number
  }> = []

  let cluster: typeof placed = []

  let clusterEnd = -1

  const laneEnds: number[] = []

  function closeCluster() {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1))

    cluster.forEach((item) => {
      item.lanes = lanes
    })

    cluster = []

    laneEnds.length = 0
  }

  for (const event of sorted) {
    const start = toMinutes(event.start)

    const end = toMinutes(event.end)

    if (start >= clusterEnd && cluster.length) closeCluster()

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)

    if (lane === -1) lane = laneEnds.length

    laneEnds[lane] = end

    const item = { event, lane, lanes: 1 }

    cluster.push(item)

    placed.push(item)

    clusterEnd = Math.max(clusterEnd, end)
  }

  if (cluster.length) closeCluster()

  return placed
}

// ─── Details sheet ────────────────────────────────────────────────────────────

function EventSheet({
  event,
  date,
  onClose,
  label = "Availability details",
}: {
  event: TimetableEvent
  date: Date
  onClose: () => void
  /** The sheet's accessible name: availability for a member, an event for an administrator. */
  label?: string
}) {
  const rows: Array<[string, string]> = [
    [
      "Day",
      date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    ],

    [
      "Time",
      event.allDay
        ? "All day"
        : `${formatClock(event.start)} to ${formatClock(event.end)}`,
    ],

    ["Status", STATUS_TEXT[event.status]],

    ...(event.rows ?? []),
  ]

  rows.push([
    "How often",
    event.repeatsWeekly
      ? "Repeats every week"
      : event.repeatsMonthly
        ? "Repeats every month"
        : // A one-off change to availability reads differently from a single
          // serving slot, event, or administrator's scheduled event.
          event.status === "available" || event.status === "unavailable"
          ? "One-time change"
          : "One-time",
  ])

  const { closing, close } = useSheetClose()

  const action = event.action

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-closing={closing}
    >
      <div
        className="sheet-backdrop absolute inset-0 bg-black/50"
        onClick={() => close(onClose)}
        aria-hidden="true"
      />
      <div
        className="sheet-panel relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-6 pt-4 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-[#D1D9E8]" />
        <div className="mb-4 flex items-center gap-3">
          <span
            className={`h-6 w-6 shrink-0 rounded-md ${TIMETABLE_COLORS[event.color].swatch}`}
            aria-hidden="true"
          />
          <p className="text-2xl font-extrabold text-[#1B3A6B]">
            {event.label}
          </p>
        </div>
        <dl className="mb-6 divide-y divide-[#D1D9E8] rounded-2xl border border-[#D1D9E8] bg-[#F4F6FB] px-5">
          {rows.map(([label, value]) => (
            <div key={label} className="py-3">
              <dt className="text-[14px] font-bold uppercase tracking-wide text-[#64748B]">
                {label}
              </dt>
              <dd className="mt-1 text-[18px] font-bold leading-snug text-[#1A202C]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {event.note && (
          <p className="mb-5 rounded-xl bg-[#FEF3DC] px-4 py-3 text-[17px] font-semibold text-[#6B4A0B]">
            {event.note}
          </p>
        )}
        <div className="flex flex-col gap-3">
          {action && (
            <Button onClick={() => close(action.onClick)}>
              {action.label}
            </Button>
          )}
          <Button
            variant={action ? "secondary" : "primary"}
            onClick={() => close(onClose)}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Event block ──────────────────────────────────────────────────────────────

const MIN_FIT = 0.6 // the smallest the text may shrink to, as a share of its normal size

/** One box on the timetable. Its text shrinks step by step until it fits inside the box, and re-fits when the box is resized. */

function EventBlock({
  event,
  timeText,
  showDetail,
  onClick,
  ariaLabel,
  style,
}: {
  event: TimetableEvent

  timeText: string

  showDetail: boolean

  onClick: () => void

  ariaLabel: string

  style: CSSProperties
}) {
  const ref = useRef<HTMLButtonElement>(null)

  const [fit, setFit] = useState(1)

  useLayoutEffect(() => {
    const box = ref.current

    if (!box) return

    function refit() {
      if (!box) return

      const overflows = () =>
        box.scrollWidth > box.clientWidth + 1 ||
        box.scrollHeight > box.clientHeight + 1

      let scale = 1

      box.style.setProperty("--fit", "1")

      while (scale > MIN_FIT && overflows()) {
        scale = Math.max(MIN_FIT, Math.round((scale - 0.05) * 100) / 100)

        box.style.setProperty("--fit", String(scale))
      }

      setFit(scale)
    }

    refit()

    const observer = new ResizeObserver(refit)

    observer.observe(box)

    document.fonts?.ready.then(refit)

    return () => observer.disconnect()
  }, [event.label, timeText, event.detail, showDetail])

  const size = (px: number) => ({
    fontSize: `calc(${px}px * var(--fit, ${fit}))`,
  })

  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`absolute z-10 flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 px-1.5 py-1 text-center shadow-sm transition-transform hover:scale-[1.02] focus-visible:z-20 ${TIMETABLE_COLORS[event.color].block}`}
      style={style}
    >
      <span className="font-extrabold leading-tight" style={size(16)}>
        {event.label}
      </span>
      <span className="mt-0.5 font-bold leading-tight" style={size(14)}>
        {timeText}
      </span>
      {/* The detail fits in the wide one-day column, and in the week view on large screens. */}
      {event.detail && (
        <span
          className={`font-semibold leading-tight ${
            showDetail ? "" : "hidden lg:block"
          }`}
          style={size(14)}
        >
          {event.detail}
        </span>
      )}
    </button>
  )
}

// ─── Timetable ────────────────────────────────────────────────────────────────

export function WeeklyTimetable({
  events,
  weekStart,
  legend,
  view,
  onViewChange,
  dayIndex,
  onDayIndexChange,
  layout = "inline", // a Monday

  detailsLabel,

  // The view and chosen day are kept by the parent so they survive leaving and returning to this screen.

  // "preview": a short, still picture of the first rows (no scrolling, no taps) for the home page.

  // "full": the whole table at its natural height, for the full-screen schedule, whose page scrolls up and down.
}: {
  events: TimetableEvent[]

  weekStart: Date

  legend?: Array<{ label: string; color: TimetableColor }>

  view: "week" | "day"

  onViewChange: (view: "week" | "day") => void

  dayIndex: number

  onDayIndexChange: (index: number) => void

  layout?: "inline" | "preview" | "full"

  /** Accessible name of the details sheet; defaults to the member's wording. */
  detailsLabel?: string
}) {
  const preview = layout === "preview"

  const today = useMemo(() => new Date(), [])

  const days = Array.from({ length: 7 }, (_, index) =>
    addDaysTo(weekStart, index),
  )

  const todayIndex = days.findIndex((date) => sameDate(date, today))

  const [selected, setSelected] = useState<{
    event: TimetableEvent
    date: Date
  } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const headerRef = useRef<HTMLDivElement>(null) // "full" only: the day header, kept outside the sideways scroll so it can stick to the page

  const rootRef = useRef<HTMLDivElement>(null)

  // "full": the day header follows the table when it's swiped sideways.

  function syncHeader() {
    if (headerRef.current && scrollRef.current)
      headerRef.current.scrollLeft = scrollRef.current.scrollLeft
  }

  // Show at least 6 AM – 9 PM, stretching to fit any earlier or later entry. All-day blocks fill whatever is shown.

  const timed = events.filter((event) => !event.allDay)

  const firstHour = Math.min(
    6,
    ...timed.map((event) => Math.floor(toMinutes(event.start) / 60)),
  )

  const lastHour = Math.max(
    21,
    ...timed.map((event) => Math.ceil(toMinutes(event.end) / 60)),
  )

  const hours = Array.from(
    { length: lastHour - firstHour },
    (_, index) => firstHour + index,
  )

  const gridHeight = hours.length * HOUR_HEIGHT

  const hourText = (hour: number) => `${String(hour).padStart(2, "0")}:00`

  const placed = events.map((event) =>
    event.allDay
      ? { ...event, start: hourText(firstHour), end: hourText(lastHour) }
      : event,
  )

  const shownDays =
    view === "week"
      ? days.map((date, index) => ({ date, index }))
      : [{ date: days[dayIndex], index: dayIndex }]

  // On narrow screens, slide today's column into view.

  const weekStartKey = localDateKey(weekStart)

  useEffect(() => {
    const container = scrollRef.current

    if (!container || view !== "week" || todayIndex < 1) return

    const column = rootRef.current?.querySelector<HTMLElement>(
      `[data-day="${todayIndex}"]`,
    )

    if (column && container.scrollWidth > container.clientWidth) {
      container.scrollLeft = Math.max(0, column.offsetLeft - 96)

      syncHeader()
    }
  }, [view, todayIndex, weekStartKey])

  // The preview can't be scrolled, so start it at the hour of the earliest entry shown instead of an empty morning.

  // Only the preview: every other layout starts at the first hour.

  const shownIndexes = shownDays.map((day) => day.index)

  const earliestHour = Math.min(
    ...timed
      .filter((event) => shownIndexes.includes(event.day))
      .map((event) => Math.floor(toMinutes(event.start) / 60)),
  )

  const previewTop = Number.isFinite(earliestHour)
    ? (earliestHour - firstHour) * HOUR_HEIGHT
    : 0

  useEffect(() => {
    if (preview && scrollRef.current) scrollRef.current.scrollTop = previewTop
  }, [preview, previewTop])

  const columns =
    view === "week"
      ? "var(--time-col) repeat(7, minmax(120px, 1fr))"
      : "var(--time-col) minmax(0, 1fr)"

  const minWidth = view === "week" ? "min-w-[916px] lg:min-w-0" : ""

  const frame =
    "[--time-col:76px] sm:[--time-col:96px] border-2 border-[#1B3A6B]/80 bg-white shadow-sm"

  const headerRow = (
    <div
      className="sticky top-0 z-30 grid border-b-2 border-[#1B3A6B]/80"
      style={{ gridTemplateColumns: columns }}
    >
      <div className="sticky left-0 z-10 border-r-2 border-[#1B3A6B]/80 bg-[#E8EDF7] px-2 py-3 text-center text-[14px] font-bold text-[#1B3A6B]">
        Time
      </div>
      {shownDays.map(({ date, index }) => {
        const isToday = index === todayIndex

        return (
          <div
            key={index}
            data-day={index}
            className={`border-r border-[#9BA8C0] px-2 py-2 text-center last:border-r-0 ${
              isToday
                ? "bg-[#1B3A6B] text-white"
                : "bg-[#E8EDF7] text-[#1B3A6B]"
            }`}
          >
            <p className="text-[17px] font-extrabold leading-tight">
              {DAY_LONG[index]}
            </p>
            <p
              className={`text-[15px] font-semibold ${
                isToday ? "text-white" : "text-[#475569]"
              }`}
            >
              {date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
              {isToday ? " · Today" : ""}
            </p>
          </div>
        )
      })}
    </div>
  )

  const body = (
    <div className="grid" style={{ gridTemplateColumns: columns }}>
      {/* Time labels */}
      <div className="sticky left-0 z-20 border-r-2 border-[#1B3A6B]/80 bg-[#E8EDF7]">
        {hours.map((hour) => (
          <div
            key={hour}
            className="flex flex-col items-center justify-center border-b border-[#9BA8C0] px-1 text-center last:border-b-0"
            style={{ height: HOUR_HEIGHT }}
          >
            <span className="text-[16px] font-extrabold leading-tight text-[#1B3A6B]">
              {hourLabel(hour)}
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {shownDays.map(({ date, index }) => (
        <div
          key={index}
          className={`relative border-r border-[#9BA8C0] last:border-r-0 ${
            index === todayIndex ? "bg-[#1B3A6B]/[0.04]" : ""
          }`}
          style={{
            height: gridHeight,

            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT / 2 - 1}px, #E2E8F0 ${HOUR_HEIGHT / 2 - 1}px, #E2E8F0 ${HOUR_HEIGHT / 2}px, transparent ${HOUR_HEIGHT / 2}px, transparent ${HOUR_HEIGHT - 1}px, #9BA8C0 ${HOUR_HEIGHT - 1}px, #9BA8C0 ${HOUR_HEIGHT}px)`,
          }}
        >
          {layoutDay(placed.filter((event) => event.day === index)).map(
            ({ event, lane, lanes }) => {
              const top =
                ((toMinutes(event.start) - firstHour * 60) / 60) * HOUR_HEIGHT

              const height = Math.max(
                ((toMinutes(event.end) - toMinutes(event.start)) / 60) *
                  HOUR_HEIGHT,
                HOUR_HEIGHT * 0.85,
              )

              const width = 100 / lanes

              const timeText = event.allDay
                ? "All day"
                : formatRange(event.start, event.end)

              return (
                <EventBlock
                  key={event.id}
                  event={event}
                  timeText={timeText}
                  showDetail={view === "day"}
                  onClick={() => setSelected({ event, date })}
                  ariaLabel={`${event.label}, ${DAY_LONG[index]}, ${
                    event.allDay
                      ? "all day"
                      : `${formatClock(event.start)} to ${formatClock(event.end)}`
                  }${event.detail ? `, ${event.detail}` : ""}`}
                  style={{
                    top: top + 2,
                    height: height - 4,
                    left: `calc(${lane * width}% + 3px)`,
                    width: `calc(${width}% - 6px)`,
                  }}
                />
              )
            },
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div ref={rootRef}>
      {/* Week / Day switch */}
      {!preview && (
        <div
          className="mb-4 flex gap-1 rounded-xl bg-[#E8EDF7] p-1"
          role="group"
          aria-label="How to show the schedule"
        >
          <Button
            variant={view === "week" ? "tabActive" : "tabInactive"}
            size="compact"
            onClick={() => onViewChange("week")}
            ariaPressed={view === "week"}
          >
            Whole Week
          </Button>
          <Button
            variant={view === "day" ? "tabActive" : "tabInactive"}
            size="compact"
            onClick={() => onViewChange("day")}
            ariaPressed={view === "day"}
          >
            One Day
          </Button>
        </div>
      )}

      {view === "day" && !preview && (
        <div
          className="mb-4 grid grid-cols-7 gap-1.5"
          role="group"
          aria-label="Choose a day"
        >
          {days.map((date, index) => {
            const active = index === dayIndex

            const count = events.filter((event) => event.day === index).length

            return (
              <button
                key={index}
                onClick={() => onDayIndexChange(index)}
                aria-pressed={active}
                aria-label={`${DAY_LONG[index]} ${date.getDate()}, ${count} ${
                  count === 1 ? "entry" : "entries"
                }`}
                className={`flex min-h-[68px] flex-col items-center justify-center rounded-xl border-2 text-center transition-colors ${
                  active
                    ? "border-[#1B3A6B] bg-[#1B3A6B] text-white"
                    : "border-[#D1D9E8] bg-white text-[#1B3A6B] hover:border-[#1B3A6B]"
                }`}
              >
                <span className="text-[15px] font-bold">
                  {DAY_SHORT[index]}
                </span>
                <span className="text-[19px] font-extrabold leading-tight">
                  {date.getDate()}
                </span>
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    count ? "bg-[#C9921A]" : "bg-transparent"
                  }`}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>
      )}

      {view === "day" && !preview && (
        <p className="mb-3 text-[15px] font-semibold text-[#64748B]">
          A gold dot means you have something that day. Tap a box for details.
        </p>
      )}

      {view === "week" && !preview && (
        <p className="mb-2 text-[15px] font-semibold text-[#64748B] lg:hidden">
          Swipe left or right to see every day. Tap a box for details.
        </p>
      )}

      {layout === "full" ? (
        // The whole table at its natural height; only the page scrolls up and down. The table itself only swipes sideways.

        // A sticky header can't stick to the page from inside a sideways-scrolling box, so the day header sits above it,

        // sticks to the top of the page, and follows the sideways swipe (syncHeader). The Time column stays pinned on the left.

        <div className={`rounded-2xl ${frame}`}>
          <div
            ref={headerRef}
            className="sticky top-0 z-30 overflow-hidden rounded-t-[14px]"
          >
            <div className={minWidth}>{headerRow}</div>
          </div>
          <div
            ref={scrollRef}
            onScroll={syncHeader}
            className="overflow-x-auto overflow-y-hidden rounded-b-[14px]"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className={minWidth}>{body}</div>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={scrollRef}
            inert={preview}
            className={`relative rounded-2xl ${frame} ${
              preview
                ? "pointer-events-none h-[220px] overflow-hidden"
                : "max-h-[72vh] overflow-auto lg:max-h-none"
            }`}
            style={{ scrollbarWidth: "thin" }}
          >
            <div className={minWidth}>
              {headerRow}
              {body}
            </div>
          </div>
          {/* Soft fade at the bottom of the preview, so it's clear there is more below. */}
          {preview && (
            <div
              className="pointer-events-none absolute inset-x-[2px] bottom-[2px] h-24 rounded-b-2xl bg-gradient-to-b from-white/0 via-white/80 to-white"
              aria-hidden="true"
            />
          )}
        </div>
      )}

      {view === "day" &&
        !preview &&
        events.filter((event) => event.day === dayIndex).length === 0 && (
          <p className="mt-3 rounded-xl bg-white p-4 text-center text-[17px] font-semibold text-[#64748B]">
            Nothing added for {DAY_LONG[dayIndex]}.
          </p>
        )}

      {legend && legend.length > 0 && !preview && (
        <div
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[16px] font-semibold text-[#1A202C]"
          aria-label="Color guide"
        >
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-2">
              <span
                className={`h-5 w-5 rounded ${TIMETABLE_COLORS[item.color].swatch}`}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {selected && (
        <EventSheet
          event={selected.event}
          date={selected.date}
          label={detailsLabel}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
