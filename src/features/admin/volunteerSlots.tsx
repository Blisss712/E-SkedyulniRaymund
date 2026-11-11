import { useEffect, useMemo, useRef, useState } from "react"
import { Button, InputField } from "../../shared/ui"
import type { AdminEvent, Organization } from "./types"
import {
  eventOccurrences,
  eventSchedule,
  formatEventWhen,
} from "./eventSchedule"
import { MemberAvatar, OrganizationFilter } from "./orgGroups"
import { useVolunteerSlots } from "./useVolunteerSlots"
import {
  formatSlotTime,
  type NewVolunteerSlot,
  type SlotVolunteer,
  type VolunteerSlotRecord,
} from "../slots/volunteerSlotsApi"

type SlotState = ReturnType<typeof useVolunteerSlots>

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** The local `YYYY-MM-DD` key, so "today" does not shift a day in UTC+8. */
function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Adds days to a `YYYY-MM-DD` key without crossing into another timezone. */
function addDaysKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The next day the event actually takes place on or after `from`. Recurring
 * events keep occurring after their original end date, so this reads the same
 * recurrence rules the member timetable uses.
 */
function nextOccurrenceOnOrAfter(
  event: AdminEvent,
  from: string,
): string | null {
  const schedule = eventSchedule(event)
  if (!schedule.startDate || !schedule.endDate) return null
  // A one-off event needs no recurrence scan; this also keeps an event that is
  // more than a year away eligible.
  if (event.recurrence === "none") {
    const endsAt = new Date(event.endsAt)
    if (!Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= Date.now()) {
      return null
    }
    if (schedule.endDate < from) return null
    return schedule.startDate > from ? schedule.startDate : from
  }
  const dates = eventOccurrences(event, from, addDaysKey(from, 370))
  return dates[0]?.date ?? null
}

function formatSlotDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

/** "Next: Sun, Nov 15, 2026 · 9:00 AM – 10:30 AM · Weekly" for the event card. */
function nextOccurrenceLabel(event: AdminEvent, nextDate: string) {
  const schedule = eventSchedule(event)
  const recurrence =
    event.recurrence === "weekly"
      ? " · Weekly"
      : event.recurrence === "monthly"
        ? " · Monthly"
        : ""
  if (!nextDate || !schedule.startTime || !schedule.endTime) {
    return formatEventWhen(event)
  }
  return `Next: ${formatSlotDate(nextDate)} · ${formatSlotTime(schedule.startTime)} – ${formatSlotTime(schedule.endTime)}${recurrence}`
}

function formatSignupDate(value: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

/**
 * The slots of one event. The event id is authoritative; rows opened before
 * event linking was installed are matched by ministry, label, and one of the
 * event's actual days.
 */
function slotsForEvent(slots: VolunteerSlotRecord[], event: AdminEvent) {
  return slots
    .filter((slot) => {
      if (slot.eventId) return slot.eventId === event.id
      if (slot.organizationId !== event.organizationId) return false
      if (
        slot.label.trim().toLowerCase() !== event.title.trim().toLowerCase()
      ) {
        return false
      }
      return eventOccurrences(event, slot.date, slot.date).length > 0
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}

function crewCount(state: SlotState, slotIds: string[]) {
  const ids = new Set(slotIds)
  return new Set(
    state.signups
      .filter((signup) => ids.has(signup.slotId))
      .map((signup) => signup.userId),
  ).size
}

function OpenSlotForm({
  event,
  slots,
  onCancel,
  onSave,
}: {
  event: AdminEvent
  slots: VolunteerSlotRecord[]
  onCancel: () => void
  onSave: (input: NewVolunteerSlot) => Promise<{ ok: boolean; message?: string }>
}) {
  const schedule = eventSchedule(event)
  const firstDate =
    nextOccurrenceOnOrAfter(event, todayKey()) || schedule.startDate
  const [label, setLabel] = useState(event.title)
  const [date, setDate] = useState(firstDate)
  const [time, setTime] = useState(schedule.startTime)
  const [spots, setSpots] = useState("3")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    const totalSpots = Number(spots)
    if (!label.trim()) {
      setError("Give the slot a name, or keep the event title.")
      return
    }
    if (!date || !time) {
      setError("Choose the date and the time volunteers should arrive.")
      return
    }
    if (date < todayKey()) {
      setError("Choose a date on or after today.")
      return
    }
    if (eventOccurrences(event, date, date).length === 0) {
      setError("This date is not one of the event's scheduled days.")
      return
    }
    const arrival = new Date(`${date}T${time}:00`)
    if (Number.isNaN(arrival.getTime()) || arrival.getTime() <= Date.now()) {
      setError("Choose a date and arrival time in the future.")
      return
    }
    if (!Number.isFinite(totalSpots) || totalSpots < 1) {
      setError("How many volunteers do you need? Enter 1 or more.")
      return
    }
    if (
      slots.some((slot) => slot.date === date && slot.time === time.slice(0, 5))
    ) {
      setError("A slot for this event at that date and time is already open.")
      return
    }

    setSaving(true)
    setError("")
    const result = await onSave({
      organizationId: event.organizationId,
      eventId: event.id,
      label: label.trim(),
      date,
      time,
      totalSpots,
    })
    setSaving(false)
    if (!result.ok) setError(result.message || "Unable to open this slot.")
  }

  return (
    <div className="border-t border-border bg-bg/60 px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-bold text-text">Open a volunteer slot</p>
          <p className="mt-0.5 text-sm text-muted">
            Members will see this slot on their Open Slots tab and be added to
            the volunteer list for {event.title}.
          </p>
        </div>
        <p className="text-xs font-bold uppercase tracking-wide text-gold">
          {formatEventWhen(event)}
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <InputField
            id={`slot-label-${event.id}`}
            label="Slot name"
            value={label}
            onChange={(value) => {
              setLabel(value)
              setError("")
            }}
            placeholder="What volunteers are needed for"
            helper="Shown to members. The event title works well."
          />
        </div>
        <InputField
          id={`slot-date-${event.id}`}
          type="date"
          label="Date"
          value={date}
          min={todayKey()}
          onChange={(value) => {
            setDate(value)
            setError("")
          }}
        />
        <InputField
          id={`slot-time-${event.id}`}
          type="time"
          label="Arrival time"
          value={time}
          onChange={(value) => {
            setTime(value)
            setError("")
          }}
        />
        <InputField
          id={`slot-spots-${event.id}`}
          type="number"
          label="Volunteers needed"
          value={spots}
          min="1"
          onChange={(value) => {
            setSpots(value)
            setError("")
          }}
          helper="The number of people who can sign up for this slot."
        />
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-light px-3 py-2 text-sm font-semibold text-red"
        >
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          fullWidth={false}
          size="compact"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          fullWidth={false}
          size="compact"
          onClick={() => void submit()}
          disabled={saving}
        >
          {saving ? "Opening…" : "Open slot"}
        </Button>
      </div>
    </div>
  )
}

function VolunteerChip({
  volunteer,
  onRemove,
}: {
  volunteer: SlotVolunteer
  onRemove: () => void
}) {
  const signedUp = formatSignupDate(volunteer.signedUpAt)
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border bg-white px-2.5 py-2">
      <MemberAvatar name={volunteer.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">
          {volunteer.name}
        </span>
        <span className="block truncate text-xs text-muted">
          {volunteer.email ||
            (signedUp ? `Signed up ${signedUp}` : "Volunteer")}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${volunteer.name} from this slot`}
        title="Remove volunteer"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-light hover:text-red"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-4"
        >
          <path strokeLinecap="round" d="M5 5l10 10M15 5 5 15" />
        </svg>
      </button>
    </li>
  )
}

function SlotRoster({
  slot,
  state,
  onDelete,
}: {
  slot: VolunteerSlotRecord
  state: SlotState
  onDelete: () => void
}) {
  const signups = state.signupsForSlot(slot.id)
  const volunteers = state.volunteersForSlot(slot.id)
  const filled = signups.length
  const open = Math.max(0, slot.totalSpots - filled)
  const percent =
    slot.totalSpots > 0
      ? Math.min(100, Math.round((filled / slot.totalSpots) * 100))
      : 0
  const namesUnavailable = volunteers.length < signups.length

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-bold text-text">
            {formatSlotDate(slot.date)} · {formatSlotTime(slot.time)}
          </p>
          <p className="mt-0.5 text-sm text-muted">{slot.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              open === 0
                ? "bg-slate-100 text-muted"
                : "bg-green-light text-green"
            }`}
          >
            {open === 0
              ? "Full"
              : `${open} ${open === 1 ? "spot" : "spots"} open`}
          </span>
          <Button
            variant="ghost"
            size="compact"
            fullWidth={false}
            onClick={onDelete}
            className="border border-red/30 text-red hover:bg-red-light"
          >
            Delete slot
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
          <div
            className="h-full rounded-full bg-navy transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="shrink-0 text-xs font-bold text-muted">
          {filled} of {slot.totalSpots}
        </p>
      </div>

      {volunteers.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
            Volunteers
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {volunteers.map((volunteer) => (
              <VolunteerChip
                key={volunteer.userId}
                volunteer={volunteer}
                onRemove={() => {
                  if (
                    window.confirm(`Remove ${volunteer.name} from this slot?`)
                  ) {
                    void state.removeVolunteer(slot.id, volunteer.userId)
                  }
                }}
              />
            ))}
          </ul>
        </div>
      ) : signups.length > 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {signups.length}{" "}
          {signups.length === 1 ? "volunteer has" : "volunteers have"} signed up,
          but their names are not visible in this workspace yet.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No one has volunteered yet. Share the event with your ministry — the
          slot appears under their Open Slots tab.
        </p>
      )}

      {namesUnavailable && volunteers.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-gold">
          Some volunteer names are not visible in this workspace yet. Ask an
          administrator to apply the volunteer-slot database update.
        </p>
      )}
    </div>
  )
}

function EventVolunteerCard({
  event,
  organization,
  nextDate,
  slots,
  state,
  formOpen,
  onToggleForm,
  onSaveSlot,
}: {
  event: AdminEvent
  organization?: Organization
  /** The event's next scheduled day, which is what "Open slot" defaults to. */
  nextDate: string
  slots: VolunteerSlotRecord[]
  state: SlotState
  formOpen: boolean
  onToggleForm: () => void
  onSaveSlot: (
    input: NewVolunteerSlot,
  ) => Promise<{ ok: boolean; message?: string }>
}) {
  const totalSpots = slots.reduce((total, slot) => total + slot.totalSpots, 0)
  const filled = slots.reduce(
    (total, slot) => total + state.signupsForSlot(slot.id).length,
    0,
  )
  const openSpots = Math.max(0, totalSpots - filled)
  const crew = crewCount(
    state,
    slots.map((slot) => slot.id),
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="border-b border-border bg-[#F8FAFD] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gold">
              {organization?.name ?? "Ministry"}
            </p>
            <p className="mt-1 text-lg font-bold text-text">{event.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {nextOccurrenceLabel(event, nextDate)} · {event.location}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted">
              <span>
                {slots.length} {slots.length === 1 ? "slot" : "slots"}
              </span>
              <span>
                {crew} {crew === 1 ? "volunteer" : "volunteers"}
              </span>
              <span>
                {openSpots} {openSpots === 1 ? "spot" : "spots"} open
              </span>
            </p>
          </div>
          <Button
            fullWidth={false}
            size="compact"
            variant={formOpen ? "secondary" : "primary"}
            onClick={onToggleForm}
            className="shrink-0 whitespace-nowrap"
          >
            {formOpen ? "Close form" : "Open slot"}
          </Button>
        </div>
      </div>

      {formOpen && (
        <OpenSlotForm
          event={event}
          slots={slots}
          onCancel={onToggleForm}
          onSave={onSaveSlot}
        />
      )}

      <div className="divide-y divide-border">
        {slots.length > 0 ? (
          slots.map((slot) => (
            <SlotRoster
              key={slot.id}
              slot={slot}
              state={state}
              onDelete={() => {
                if (
                  window.confirm(
                    "Delete this slot? Everyone signed up will be removed from the event's volunteer list.",
                  )
                ) {
                  void state.deleteSlot(slot.id)
                }
              }}
            />
          ))
        ) : (
          <p className="px-4 py-6 text-sm leading-relaxed text-muted sm:px-5">
            No volunteer slots have been opened for this event yet. Use{" "}
            <span className="font-semibold text-text">Open slot</span> to invite
            volunteers and start the event's volunteer list.
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * The workspace screen for "admins, coordinators, and leaders": choose an
 * upcoming event, open a volunteer slot for it, and read the list of volunteers
 * who signed up. A coordinator only sees their own ministries' events and slots.
 */
export function VolunteerSlotsSection({
  events,
  organizations,
  scoped,
  eventsLoading = false,
  onOpenEvents,
  initialEventId,
  onInitialEventHandled,
}: {
  events: AdminEvent[]
  organizations: Organization[]
  scoped: boolean
  /** True while the workspace is still reading the event list. */
  eventsLoading?: boolean
  /** Sends the reader to Events when there is nothing to open a slot for yet. */
  onOpenEvents: () => void
  /** An event row's "Volunteers" action asks this screen to open that event's form. */
  initialEventId?: string | null
  onInitialEventHandled?: () => void
}) {
  const state = useVolunteerSlots({
    organizationIds: scoped
      ? organizations.map((organization) => organization.id)
      : undefined,
  })
  const [query, setQuery] = useState("")
  const [organizationFilter, setOrganizationFilter] = useState("all")
  const [formEventId, setFormEventId] = useState<string | null>(null)
  const today = todayKey()

  // The parent's callback is rebuilt on each render; keep only the current one
  // so the "open this event's form" intent is consumed exactly once.
  const onInitialEventHandledRef = useRef(onInitialEventHandled)
  onInitialEventHandledRef.current = onInitialEventHandled
  useEffect(() => {
    if (!initialEventId) return
    setFormEventId(initialEventId)
    onInitialEventHandledRef.current?.()
  }, [initialEventId])

  const nextDates = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const event of events) {
      map.set(event.id, nextOccurrenceOnOrAfter(event, today))
    }
    return map
  }, [events, today])

  const upcomingAll = useMemo(
    () =>
      events.filter(
        (event) => event.status === "published" && nextDates.get(event.id),
      ),
    [events, nextDates],
  )

  const upcomingEvents = useMemo(
    () =>
      upcomingAll
        .filter(
          (event) =>
            organizationFilter === "all" ||
            event.organizationId === organizationFilter,
        )
        .filter((event) =>
          event.title.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          (nextDates.get(a.id) ?? "").localeCompare(nextDates.get(b.id) ?? ""),
        ),
    [upcomingAll, nextDates, organizationFilter, query],
  )

  const organizationOptions = [
    { value: "all", label: "All ministries", count: upcomingAll.length },
    ...organizations
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((organization) => ({
        value: organization.id,
        label: organization.name,
        count: upcomingAll.filter(
          (event) => event.organizationId === organization.id,
        ).length,
      })),
  ]

  const slotsByEvent = useMemo(() => {
    const map = new Map<string, VolunteerSlotRecord[]>()
    for (const event of upcomingEvents) {
      map.set(event.id, slotsForEvent(state.slots, event))
    }
    return map
  }, [state.slots, upcomingEvents])

  // Legacy and sample slots that do not belong to any visible event stay
  // manageable instead of disappearing from both screens.
  const otherSlots = useMemo(() => {
    const linked = new Set<string>()
    for (const event of events) {
      for (const slot of slotsForEvent(state.slots, event)) linked.add(slot.id)
    }
    return state.slots
      .filter((slot) => !linked.has(slot.id))
      .sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      )
  }, [events, state.slots])

  async function saveSlot(input: NewVolunteerSlot) {
    const result = await state.createSlot(input)
    if (result.ok) setFormEventId(null)
    return result
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gold">
            {scoped ? "Coordination" : "Administration"}
          </p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
            Volunteer slots
          </p>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
            Open a slot for a specific upcoming event, then read the volunteer
            list as members sign up. Each slot belongs to that event, so its
            volunteers appear together here.
          </p>
        </div>
        <Button
          variant="ghost"
          size="compact"
          fullWidth={false}
          onClick={state.refresh}
          className="shrink-0 border border-border"
        >
          Refresh volunteers
        </Button>
      </div>

      {state.error && (
        <div
          role="alert"
          className="rounded-xl border border-red/30 bg-red-light px-4 py-3 text-sm text-red"
        >
          {state.error}
        </div>
      )}

      {!state.schemaReady && !state.loading && (
        <div className="rounded-xl border border-gold/30 bg-gold-light px-4 py-3 text-sm leading-relaxed text-gold">
          <p className="font-bold">One database update is still needed.</p>
          <p className="mt-1">
            Run{" "}
            <code className="rounded bg-white/70 px-1 py-0.5 text-[12px]">
              supabase/event_volunteer_slots.sql
            </code>{" "}
            once in the Supabase SQL editor.{" "}
            {scoped
              ? "Until then you can read the slots, but opening one or reading other volunteers' names may be blocked."
              : "Slots opened now keep working; the update links them to their event and lets coordinators manage them too."}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
          <InputField
            id="slot-event-search"
            label="Search events"
            value={query}
            onChange={setQuery}
            placeholder="Search by event title"
          />
          <OrganizationFilter
            id="slot-organization"
            label="Ministry"
            value={organizationFilter}
            onChange={setOrganizationFilter}
            options={organizationOptions}
          />
          <p className="rounded-xl bg-bg px-4 py-3 text-sm font-semibold text-muted">
            {upcomingEvents.length}{" "}
            {upcomingEvents.length === 1 ? "upcoming event" : "upcoming events"}
          </p>
        </div>
      </div>

      {state.loading || eventsLoading ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
          <p className="text-xl font-bold text-text">Loading volunteer slots</p>
          <p className="mx-auto mt-2 max-w-md text-muted">
            Reading the slots and volunteer lists from your workspace.
          </p>
        </div>
      ) : upcomingEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
          <p className="text-xl font-bold text-text">
            No upcoming events to open a slot for
          </p>
          <p className="mx-auto mt-2 max-w-lg leading-relaxed text-muted">
            {events.length
              ? "Publish an event first, then come back here to open its volunteer slot."
              : "Create and publish an event first, then open its volunteer slot here."}
          </p>
          <div className="mt-5 flex justify-center">
            <Button fullWidth={false} size="compact" onClick={onOpenEvents}>
              Go to Events
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {upcomingEvents.map((event) => (
            <EventVolunteerCard
              key={event.id}
              event={event}
              organization={organizations.find(
                (organization) => organization.id === event.organizationId,
              )}
              nextDate={nextDates.get(event.id) ?? ""}
              slots={slotsByEvent.get(event.id) ?? []}
              state={state}
              formOpen={formEventId === event.id}
              onToggleForm={() =>
                setFormEventId((current) =>
                  current === event.id ? null : event.id,
                )
              }
              onSaveSlot={saveSlot}
            />
          ))}
        </div>
      )}

      {otherSlots.length > 0 && (
        <section className="space-y-3">
          <div>
            <p className="text-xl font-bold text-text">Other volunteer slots</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Slots that are not linked to an event yet. You can still see who
              signed up and remove a slot.
            </p>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            {otherSlots.map((slot) => (
              <SlotRoster
                key={slot.id}
                slot={slot}
                state={state}
                onDelete={() => {
                  if (
                    window.confirm(
                      "Delete this slot? Everyone signed up will be removed from its volunteer list.",
                    )
                  ) {
                    void state.deleteSlot(slot.id)
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
