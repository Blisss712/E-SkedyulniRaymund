import { isSupabaseConfigured, supabase } from "../../lib/supabase"
import type { AdminEvent, EventDraft } from "./types"

/**
 * Supabase access for admin events, used when the optional FastAPI backend is
 * not configured. Events live next to organizations so the dashboard metrics,
 * the organization rows ("N events"), and the events list all count the same
 * rows.
 */

const EVENT_COLUMNS =
  "id, organization_id, title, description, starts_at, ends_at, location, capacity, registration_deadline, visibility, recurrence, repeat_until, status, created_at"

type EventRow = {
  id: string
  organization_id: string
  title: string
  description: string | null
  starts_at: string | null
  ends_at: string | null
  location: string | null
  capacity: number | null
  registration_deadline: string | null
  visibility: string | null
  recurrence: string | null
  repeat_until: string | null
  status: string | null
  created_at: string | null
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** `timestamptz` -> the `YYYY-MM-DDTHH:mm` value a datetime-local input expects. */
function toLocalInput(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `YYYY-MM-DDTHH:mm` (local) -> the `timestamptz` the database stores. */
function toIso(value: string): string | null {
  if (!value) return null
  // `new Date("2026-12-27")` is UTC midnight, which lands on the previous day in
  // negative offsets. Pin date-only values to local midnight instead.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function eventFromRow(row: EventRow): AdminEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description ?? "",
    startsAt: toLocalInput(row.starts_at),
    endsAt: toLocalInput(row.ends_at),
    location: row.location ?? "",
    capacity: row.capacity ?? 1,
    registrationDeadline: toLocalInput(row.registration_deadline),
    visibility: (row.visibility === "public" ? "public" : "members"),
    recurrence:
      row.recurrence === "weekly" || row.recurrence === "monthly" ? row.recurrence : "none",
    repeatUntil: toLocalInput(row.repeat_until).slice(0, 10),
    status:
      row.status === "published" || row.status === "cancelled" || row.status === "completed"
        ? row.status
        : "draft",
    createdAt: (row.created_at ?? "").slice(0, 10),
  }
}

function describe(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message?.trim() || fallback)
}

export async function fetchEvents(): Promise<AdminEvent[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .order("starts_at", { ascending: true })
  if (error) throw describe(error, "Unable to load events.")
  return ((data ?? []) as EventRow[]).map(eventFromRow)
}

/**
 * Validates the draft and returns the row to write. Kept inside an async
 * function so a bad draft rejects the returned promise instead of throwing
 * synchronously at the call site.
 */
function eventValues(draft: EventDraft) {
  const startsAt = toIso(draft.startsAt)
  const endsAt = toIso(draft.endsAt)
  if (!startsAt || !endsAt) throw new Error("Enter a valid start and end date and time.")
  return {
    organization_id: draft.organizationId,
    title: draft.title.trim(),
    description: draft.description,
    starts_at: startsAt,
    ends_at: endsAt,
    location: draft.location.trim(),
    capacity: draft.capacity,
    registration_deadline: toIso(draft.registrationDeadline),
    visibility: draft.visibility,
    recurrence: draft.recurrence,
    repeat_until: toIso(draft.repeatUntil || ""),
    status: draft.status,
  }
}

export async function createEventRow(id: string, draft: EventDraft): Promise<AdminEvent> {
  const { data, error } = await supabase
    .from("events")
    .insert({ id, ...eventValues(draft) })
    .select(EVENT_COLUMNS)
    .single()
  if (error) throw describe(error, "Unable to save the event.")
  return eventFromRow(data as EventRow)
}

export async function updateEventRow(id: string, draft: EventDraft): Promise<AdminEvent> {
  const { data, error } = await supabase
    .from("events")
    .update(eventValues(draft))
    .eq("id", id)
    .select(EVENT_COLUMNS)
    .single()
  if (error) throw describe(error, "Unable to save the event.")
  return eventFromRow(data as EventRow)
}

export async function setEventStatusRow(
  id: string,
  status: AdminEvent["status"],
): Promise<AdminEvent> {
  const { data, error } = await supabase
    .from("events")
    .update({ status })
    .eq("id", id)
    .select(EVENT_COLUMNS)
    .single()
  if (error) throw describe(error, "Unable to update the event.")
  return eventFromRow(data as EventRow)
}

export async function deleteEventRow(id: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", id)
  if (error) throw describe(error, "Unable to delete the event.")
}
