import { isSupabaseConfigured, supabase } from "../../lib/supabase"

/**
 * Reading and writing volunteer slots that belong to one event.
 *
 * The workspace opens a slot for a specific upcoming event, so a slot carries
 * the event id next to the date, time, and number of volunteers. Projects that
 * installed the original schema do not have `volunteer_slots.event_id` yet:
 * until `supabase/event_volunteer_slots.sql` is applied, the link is stored as a
 * small `[event:<id>]` suffix on `mass_name`. Readers always receive a clean
 * label and a separate `eventId`, so the rest of the app never sees the marker.
 */

const SLOT_COLUMNS =
  "id, organization_id, slot_date, slot_time, mass_name, total_spots, created_at"

const EVENT_MARKER = /\s*\[event:([^\]]+)\]\s*$/

/** `event_id` is unknown until the first read; cached for the session. */
let eventColumnSupported: boolean | null = null

type SlotRow = {
  id: string
  organization_id: string
  event_id?: string | null
  slot_date: string
  slot_time: string
  mass_name: string | null
  total_spots: number
  created_at?: string | null
}

type SignupRow = {
  slot_id: string
  user_id: string
  created_at?: string | null
}

type VolunteerRow = {
  slot_id: string
  user_id: string
  full_name: string | null
  email: string | null
  signed_up_at: string | null
}

type ProfileRow = {
  user_id: string
  full_name: string | null
  email: string | null
}

/** A slot exactly as the database stores it, already decoded for display. */
export type VolunteerSlotRecord = {
  id: string
  organizationId: string
  /** The event this slot is for, when it was opened for one. */
  eventId?: string
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:MM`, 24-hour */
  time: string
  /** The label members see, e.g. the event title. The marker is never included. */
  label: string
  totalSpots: number
  createdAt?: string
}

/** One member's place on a slot. */
export type SlotSignupRecord = {
  slotId: string
  userId: string
  signedUpAt: string
}

/** A volunteer with the profile fields the roster shows. */
export type SlotVolunteer = {
  slotId: string
  userId: string
  name: string
  email: string
  signedUpAt: string
}

export type NewVolunteerSlot = {
  organizationId: string
  eventId?: string
  label: string
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:MM` */
  time: string
  totalSpots: number
}

function describe(
  error: { message?: string; code?: string } | null,
  fallback: string,
) {
  return new Error(error?.message?.trim() || fallback)
}

function isMissingEventColumn(
  error: { message?: string; code?: string } | null,
) {
  return Boolean(
    error && (error.code === "42703" || /event_id/i.test(error.message ?? "")),
  )
}

/** Turns a refused insert into an explanation the workspace can act on. */
function describeSlotWriteError(
  error: { message?: string; code?: string } | null,
  fallback: string,
) {
  if (
    error?.code === "42501" ||
    /row-level security/i.test(error?.message ?? "")
  ) {
    return new Error(
      "Your workspace cannot open a slot in this ministry yet. Ask an administrator to run supabase/event_volunteer_slots.sql once.",
    )
  }
  return describe(error, fallback)
}

/** Adds the storage-only event marker. The label itself stays readable. */
export function slotLabelForStorage(label: string, eventId?: string) {
  const clean = label.trim() || "Volunteer slot"
  if (!eventId) return clean.slice(0, 180)
  // `mass_name` is VARCHAR(180); keep room for the marker.
  const suffix = ` [event:${eventId}]`
  return `${clean.slice(0, Math.max(1, 180 - suffix.length))}${suffix}`
}

/** Splits a stored label into the text members see and the event it belongs to. */
export function parseStoredSlotLabel(raw: string | null | undefined) {
  const value = raw ?? ""
  const match = value.match(EVENT_MARKER)
  if (!match)
    return { label: value.trim() || "Volunteer slot", eventId: undefined }
  return {
    label: value.replace(EVENT_MARKER, "").trim() || "Volunteer slot",
    eventId: match[1],
  }
}

/** `08:00` / `08:00:00` -> `8:00 AM`. */
export function formatSlotTime(time: string) {
  const [hourValue, minuteValue] = time.split(":")
  const hour = Number(hourValue)
  const minute = Number(minuteValue)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`
}

/** The `HH:MM` value an `<input type="time">` produces, ready for Postgres. */
function normalizeTime(time: string) {
  return time.length === 5 ? `${time}:00` : time
}

/**
 * Learns, once per session, whether `event_id` exists. This keeps the screen
 * usable on a project that has not applied the migration yet instead of failing
 * every read with an undefined-column error.
 */
export async function ensureEventColumnState(): Promise<boolean> {
  if (eventColumnSupported !== null) return eventColumnSupported
  if (!isSupabaseConfigured) {
    eventColumnSupported = false
    return false
  }
  const { error } = await supabase
    .from("volunteer_slots")
    .select("event_id")
    .limit(1)
  if (!error) {
    eventColumnSupported = true
    return true
  }
  if (isMissingEventColumn(error)) {
    eventColumnSupported = false
    return false
  }
  throw describe(error, "Unable to read volunteer slots.")
}

/** True once a read has confirmed the linked-event column exists. */
export function isEventColumnReady() {
  return eventColumnSupported === true
}

/** Forget the cached column check so the next read probes the database again. */
export function resetEventColumnState() {
  eventColumnSupported = null
}

function toRecord(row: SlotRow): VolunteerSlotRecord {
  const parsed = parseStoredSlotLabel(row.mass_name)
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id ?? parsed.eventId,
    date: row.slot_date,
    time: row.slot_time.slice(0, 5),
    label: parsed.label,
    totalSpots: row.total_spots,
    createdAt: row.created_at ?? undefined,
  }
}

/** Reads every slot, optionally limited to a coordinator's ministries. */
export async function fetchVolunteerSlots(
  organizationIds?: string[],
): Promise<VolunteerSlotRecord[]> {
  if (!isSupabaseConfigured) return []
  if (organizationIds && organizationIds.length === 0) return []

  const withEvent = await ensureEventColumnState()
  const columns = withEvent ? `${SLOT_COLUMNS}, event_id` : SLOT_COLUMNS
  let query = supabase
    .from("volunteer_slots")
    .select(columns)
    .order("slot_date", { ascending: true })
    .order("slot_time", { ascending: true })
  if (organizationIds) query = query.in("organization_id", organizationIds)

  const { data, error } = await query
  if (error) throw describe(error, "Unable to load volunteer slots.")
  return ((data ?? []) as unknown as SlotRow[]).map(toRecord)
}

/** Opens one volunteer slot for an event and returns the saved row. */
export async function createVolunteerSlot(
  input: NewVolunteerSlot,
): Promise<VolunteerSlotRecord> {
  if (!isSupabaseConfigured) {
    throw new Error("Connect a database before opening a volunteer slot.")
  }

  const id = `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const base = {
    id,
    organization_id: input.organizationId,
    slot_date: input.date,
    slot_time: normalizeTime(input.time),
    total_spots: Math.max(1, Math.floor(input.totalSpots)),
    created_at: new Date().toISOString(),
  }
  const withEvent = await ensureEventColumnState()

  if (withEvent) {
    const { data, error } = await supabase
      .from("volunteer_slots")
      .insert({
        ...base,
        event_id: input.eventId ?? null,
        mass_name: (input.label.trim() || "Volunteer slot").slice(0, 180),
      })
      .select(`${SLOT_COLUMNS}, event_id`)
      .single()
    if (!error) return toRecord(data as unknown as SlotRow)
    // 23503 is a foreign-key miss: the event was removed between opening the
    // form and saving. Keep the slot usable and link it by label instead.
    if (error.code !== "23503") {
      throw describeSlotWriteError(error, "Unable to open this volunteer slot.")
    }
  }

  // Compatibility path for a project that has not run the migration yet, or
  // for an event that no longer exists. The suffix is backfilled into
  // `event_id` by supabase/event_volunteer_slots.sql.
  const { data, error } = await supabase
    .from("volunteer_slots")
    .insert({
      ...base,
      mass_name: slotLabelForStorage(input.label, input.eventId),
    })
    .select(SLOT_COLUMNS)
    .single()
  if (error) {
    throw describeSlotWriteError(error, "Unable to open this volunteer slot.")
  }
  return toRecord(data as unknown as SlotRow)
}

/** Removes a slot and, through the cascade, its signups. */
export async function deleteVolunteerSlot(id: string): Promise<void> {
  const { error } = await supabase.from("volunteer_slots").delete().eq("id", id)
  if (error) throw describe(error, "Unable to delete this volunteer slot.")
}

/** Reads the signups for the given slots. An empty list skips the request. */
export async function fetchSlotSignups(
  slotIds: string[],
): Promise<SlotSignupRecord[]> {
  if (!isSupabaseConfigured || slotIds.length === 0) return []
  const { data, error } = await supabase
    .from("slot_signups")
    .select("slot_id, user_id, created_at")
    .in("slot_id", slotIds)
  if (error)
    throw describe(error, "Unable to load the volunteers for these slots.")
  return ((data ?? []) as SignupRow[]).map((row) => ({
    slotId: row.slot_id,
    userId: row.user_id,
    signedUpAt: row.created_at ?? "",
  }))
}

/**
 * Reads the people behind the signups.
 *
 * Prefers `list_slot_volunteers()`, a security-definer function that lets an
 * administrator or a ministry coordinator read only the volunteers of slots
 * they manage. Before that function is installed it falls back to the profiles
 * the caller is allowed to read directly, which still gives an administrator
 * every name.
 */
export async function fetchSlotVolunteers(
  slotIds: string[],
  signups: SlotSignupRecord[],
): Promise<SlotVolunteer[]> {
  if (!isSupabaseConfigured || slotIds.length === 0) return []
  const wanted = new Set(slotIds)

  let rpc: { data: unknown; error: { message?: string } | null } | null = null
  try {
    rpc = await supabase.rpc("list_slot_volunteers", { p_slot_ids: slotIds })
  } catch {
    rpc = null
  }
  if (rpc && !rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as VolunteerRow[]).map((row) => ({
      slotId: row.slot_id,
      userId: row.user_id,
      name: row.full_name?.trim() || "Member",
      email: row.email ?? "",
      signedUpAt: row.signed_up_at ?? "",
    }))
  }

  const userIds = [
    ...new Set(
      signups
        .filter((signup) => wanted.has(signup.slotId))
        .map((signup) => signup.userId),
    ),
  ]
  if (userIds.length === 0) return []

  const { data, error } = await supabase
    .from("member_profiles")
    .select("user_id, full_name, email")
    .in("user_id", userIds)
  if (error) return []

  const profiles = new Map(
    ((data ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]),
  )
  // Only include people whose profile the caller can actually read. A
  // coordinator before the migration sees their own row and the roster shows a
  // short "names are not available yet" note instead of invented names.
  return signups
    .filter((signup) => wanted.has(signup.slotId))
    .flatMap((signup) => {
      const profile = profiles.get(signup.userId)
      if (!profile) return []
      return [
        {
          slotId: signup.slotId,
          userId: signup.userId,
          name: profile.full_name?.trim() || "Member",
          email: profile.email ?? "",
          signedUpAt: signup.signedUpAt,
        },
      ]
    })
}

/** Removes one volunteer from a slot (administrator or that ministry's coordinator). */
export async function removeSlotVolunteer(
  slotId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("slot_signups")
    .delete()
    .eq("slot_id", slotId)
    .eq("user_id", userId)
  if (error) throw describe(error, "Unable to remove this volunteer.")
}
