import { useEffect, useMemo, useState } from "react"

import { INITIAL_EVENTS, INITIAL_ORGANIZATIONS } from "./data"
import { isSupabaseConfigured, supabase } from "../../lib/supabase"

import type {
  AdminEvent,
  EventDraft,
  Organization,
  OrganizationDraft,
} from "./types"

const ORGANIZATION_COLUMNS =
  "id, name, description, contact_email, phone, timezone, address, category, status, created_at"
const EVENT_COLUMNS =
  "id, organization_id, title, description, starts_at, ends_at, location, capacity, registration_deadline, visibility, recurrence, repeat_until, status, created_at"

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function toDateTimeLocal(value: unknown) {
  if (!value) return ""
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ""
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toDateLocal(value: unknown) {
  return toDateTimeLocal(value).slice(0, 10)
}

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    contactEmail: String(row.contact_email ?? ""),
    phone: String(row.phone ?? ""),
    timezone: String(row.timezone ?? "Asia/Manila"),
    address: String(row.address ?? ""),
    category: String(row.category ?? "Parish"),
    status: row.status === "inactive" ? "inactive" : "active",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function mapEvent(row: Record<string, unknown>): AdminEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    startsAt: toDateTimeLocal(row.starts_at),
    endsAt: toDateTimeLocal(row.ends_at),
    location: String(row.location ?? ""),
    capacity: Number(row.capacity ?? 0),
    registrationDeadline: toDateTimeLocal(row.registration_deadline),
    visibility: row.visibility === "public" ? "public" : "members",
    recurrence:
      row.recurrence === "weekly" || row.recurrence === "monthly"
        ? row.recurrence
        : "none",
    repeatUntil: toDateLocal(row.repeat_until),
    status:
      row.status === "published" ||
      row.status === "cancelled" ||
      row.status === "completed"
        ? row.status
        : "draft",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function useAdmin() {
  const [organizations, setOrganizations] = useState(INITIAL_ORGANIZATIONS)

  const [events, setEvents] = useState(INITIAL_EVENTS)

  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let active = true

    async function load() {
      const [organizationResult, eventResult] = await Promise.all([
        supabase.from("organizations").select(ORGANIZATION_COLUMNS),
        supabase.from("events").select(EVENT_COLUMNS),
      ])

      if (!active) return

      if (organizationResult.error || eventResult.error) {
        setError(
          organizationResult.error?.message ||
            eventResult.error?.message ||
            "Unable to load scheduling data.",
        )
      } else {
        setOrganizations(
          (organizationResult.data ?? []).map((row) =>
            mapOrganization(row as Record<string, unknown>),
          ),
        )
        setEvents(
          (eventResult.data ?? []).map((row) =>
            mapEvent(row as Record<string, unknown>),
          ),
        )
      }

      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  async function saveOrganization(
    draft: OrganizationDraft,
    id?: string,
  ): Promise<{ ok: boolean; message?: string; id?: string }> {
    const duplicate = organizations.some(
      (organization) =>
        organization.id !== id &&
        organization.name.toLowerCase() === draft.name.trim().toLowerCase(),
    )

    if (duplicate)
      return {
        ok: false,
        message: "An organization with this name already exists.",
      }

    const next: Organization = {
      ...draft,
      id: id || makeId("org"),
      name: draft.name.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
    }

    if (isSupabaseConfigured) {
      const payload = {
        id: next.id,
        name: next.name,
        description: next.description,
        contact_email: next.contactEmail,
        phone: next.phone,
        timezone: next.timezone,
        address: next.address,
        category: next.category,
        status: next.status,
      }
      const result = id
        ? await supabase
            .from("organizations")
            .update(payload)
            .eq("id", id)
            .select(ORGANIZATION_COLUMNS)
            .single()
        : await supabase
            .from("organizations")
            .insert(payload)
            .select(ORGANIZATION_COLUMNS)
            .single()

      if (result.error) {
        setError(result.error.message)
        return { ok: false, message: result.error.message }
      }

      const saved = mapOrganization(result.data as Record<string, unknown>)
      setOrganizations((current) =>
        id
          ? current.map((organization) =>
              organization.id === id ? saved : organization,
            )
          : [saved, ...current],
      )
      return { ok: true, id: saved.id }
    }

    setOrganizations((current) =>
      id
        ? current.map((organization) =>
            organization.id === id ? next : organization,
          )
        : [next, ...current],
    )
    return { ok: true, id: next.id }
  }

  async function toggleOrganization(id: string) {
    const organization = organizations.find((item) => item.id === id)
    if (!organization) return
    const status = organization.status === "active" ? "inactive" : "active"

    if (isSupabaseConfigured) {
      const result = await supabase
        .from("organizations")
        .update({ status })
        .eq("id", id)
      if (result.error) {
        setError(result.error.message)
        return
      }
    }

    setOrganizations((current) =>
      current.map((organization) =>
        organization.id === id
          ? { ...organization, status }
          : organization,
      ),
    )
  }

  async function deleteOrganization(id: string) {
    if (events.some((event) => event.organizationId === id)) return false

    if (isSupabaseConfigured) {
      const result = await supabase.from("organizations").delete().eq("id", id)
      if (result.error) {
        setError(result.error.message)
        return false
      }
    }

    setOrganizations((current) =>
      current.filter((organization) => organization.id !== id),
    )

    return true
  }

  async function saveEvent(draft: EventDraft, id?: string) {
    const next: AdminEvent = {
      ...draft,
      id: id || makeId("event"),
      createdAt: new Date().toISOString().slice(0, 10),
    }

    if (isSupabaseConfigured) {
      const payload = {
        id: next.id,
        organization_id: next.organizationId,
        title: next.title.trim(),
        description: next.description,
        starts_at: new Date(next.startsAt).toISOString(),
        ends_at: new Date(next.endsAt).toISOString(),
        location: next.location.trim(),
        capacity: next.capacity,
        registration_deadline: next.registrationDeadline
          ? new Date(next.registrationDeadline).toISOString()
          : null,
        visibility: next.visibility,
        recurrence: next.recurrence,
        repeat_until: next.repeatUntil
          ? new Date(`${next.repeatUntil}T23:59:59`).toISOString()
          : null,
        status: next.status,
      }
      const result = id
        ? await supabase
            .from("events")
            .update(payload)
            .eq("id", id)
            .select(EVENT_COLUMNS)
            .single()
        : await supabase
            .from("events")
            .insert(payload)
            .select(EVENT_COLUMNS)
            .single()

      if (result.error) {
        setError(result.error.message)
        return null
      }

      const saved = mapEvent(result.data as Record<string, unknown>)
      setEvents((current) =>
        id
          ? current.map((event) => (event.id === id ? saved : event))
          : [saved, ...current],
      )
      return saved.id
    }

    setEvents((current) =>
      id
        ? current.map((event) => (event.id === id ? next : event))
        : [next, ...current],
    )
    return next.id
  }

  async function duplicateEvent(id: string) {
    const source = events.find((event) => event.id === id)

    if (!source) return null

    const duplicate: AdminEvent = {
      ...source,

      id: makeId("event"),

      title: `${source.title} copy`,

      status: "draft",

      createdAt: new Date().toISOString().slice(0, 10),
    }

    if (isSupabaseConfigured) {
      const result = await saveEvent(duplicate)
      return result
    }

    setEvents((current) => [duplicate, ...current])

    return duplicate.id
  }

  async function cancelEvent(id: string) {
    if (isSupabaseConfigured) {
      const result = await supabase
        .from("events")
        .update({ status: "cancelled" })
        .eq("id", id)
      if (result.error) {
        setError(result.error.message)
        return
      }
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === id ? { ...event, status: "cancelled" } : event,
      ),
    )
  }

  async function deleteEvent(id: string) {
    if (isSupabaseConfigured) {
      const result = await supabase.from("events").delete().eq("id", id)
      if (result.error) {
        setError(result.error.message)
        return
      }
    }

    setEvents((current) => current.filter((event) => event.id !== id))
  }

  function findConflict(draft: EventDraft, editingId?: string) {
    const start = new Date(draft.startsAt).getTime()

    const end = new Date(draft.endsAt).getTime()

    if (!start || !end || end <= start) return null

    return (
      events.find((event) => {
        if (event.id === editingId || event.status === "cancelled") return false

        const sameContext =
          event.organizationId === draft.organizationId ||
          (event.location.trim() &&
            event.location.toLowerCase() ===
              draft.location.trim().toLowerCase())

        return (
          sameContext &&
          start < new Date(event.endsAt).getTime() &&
          end > new Date(event.startsAt).getTime()
        )
      }) ?? null
    )
  }

  const metrics = useMemo(
    () => ({
      activeOrganizations: organizations.filter(
        (organization) => organization.status === "active",
      ).length,

      publishedEvents: events.filter((event) => event.status === "published")
        .length,

      draftEvents: events.filter((event) => event.status === "draft").length,

      upcomingEvents: events.filter(
        (event) =>
          event.status === "published" && new Date(event.startsAt) > new Date(),
      ).length,
    }),
    [events, organizations],
  )

  return {
    organizations,

    events,

    metrics,

    loading,

    error,

    saveOrganization,

    toggleOrganization,

    deleteOrganization,

    saveEvent,

    duplicateEvent,

    cancelEvent,

    deleteEvent,

    findConflict,
  }
}
