import { useEffect, useMemo, useState } from "react"
import { INITIAL_EVENTS, INITIAL_ORGANIZATIONS } from "./data"
import type { AdminEvent, EventDraft, Organization, OrganizationDraft, OrganizationStatus } from "./types"
import { adminApi, isAdminApiConfigured, loadAdminData } from "./api"
import { isSupabaseConfigured } from "../../lib/supabase"
import { useAuth } from "../auth/AuthContext"
import {
  createOrganizationRow,
  deleteOrganizationRow,
  fetchOrganizations,
  setOrganizationStatusRow,
  updateOrganizationRow,
} from "../organizations/api"
import {
  createEventRow,
  deleteEventRow,
  fetchEvents,
  setEventStatusRow,
  updateEventRow,
} from "./supabaseEvents"

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * There are three possible homes for the admin data:
 *   1. the optional FastAPI backend (VITE_ADMIN_API_URL),
 *   2. Supabase, read and written straight from the browser,
 *   3. the bundled sample rows, for the offline demo.
 *
 * The sample rows are only used for (3): showing them while a real database is
 * connected is what made Organizations, the Dashboard, and Events disagree.
 */
const remoteData = isAdminApiConfigured || isSupabaseConfigured

export function useAdmin() {
  const { user } = useAuth()
  const userId = user?.id ?? ""

  const [organizations, setOrganizations] = useState<Organization[]>(
    remoteData ? [] : INITIAL_ORGANIZATIONS,
  )
  const [events, setEvents] = useState<AdminEvent[]>(remoteData ? [] : INITIAL_EVENTS)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(remoteData)

  function reportFailure(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "The admin service could not complete the request.")
    // The screen applied the change optimistically. If the write failed, read
    // the rows back so the UI never keeps a value the database rejected.
    void reload()
  }

  /** Re-reads organizations and events from whichever backend is in use. */
  async function reload() {
    if (isAdminApiConfigured) {
      const data = await loadAdminData().catch(() => null)
      if (!data) return
      setOrganizations(data.organizations)
      setEvents(data.events)
      return
    }
    if (!isSupabaseConfigured) return
    const [savedOrganizations, savedEvents] = await Promise.all([
      fetchOrganizations().catch(() => null),
      fetchEvents().catch(() => null),
    ])
    if (savedOrganizations) setOrganizations(savedOrganizations)
    if (savedEvents) setEvents(savedEvents)
  }

  useEffect(() => {
    let active = true

    async function load() {
      try {
        if (isAdminApiConfigured) {
          const data = await loadAdminData()
          if (!active) return
          setOrganizations(data.organizations)
          setEvents(data.events)
        } else if (isSupabaseConfigured) {
          if (!userId) return
          const [savedOrganizations, savedEvents] = await Promise.all([
            fetchOrganizations(),
            fetchEvents(),
          ])
          if (!active) return
          setOrganizations(savedOrganizations)
          setEvents(savedEvents)
        } else {
          return
        }
        if (active) setError("")
      } catch (reason) {
        // The first load has nothing to fall back to, so only report it.
        if (active) {
          setError(reason instanceof Error ? reason.message : "The admin service could not complete the request.")
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [userId])

  function replaceOrganization(pendingId: string, saved: Organization) {
    setOrganizations(current => current.map(item => (item.id === pendingId ? saved : item)))
  }

  function replaceEvent(pendingId: string, saved: AdminEvent) {
    setEvents(current => current.map(item => (item.id === pendingId ? saved : item)))
  }

  function saveOrganization(draft: OrganizationDraft, id?: string) {
    const name = draft.name.trim()
    const duplicate = organizations.some(
      organization => organization.id !== id && organization.name.toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) return { ok: false, message: "An organization with this name already exists." }

    const cleaned: OrganizationDraft = { ...draft, name }

    if (id) {
      setOrganizations(current => current.map(organization =>
        organization.id === id ? { ...organization, ...cleaned } : organization,
      ))
      if (isAdminApiConfigured) {
        void adminApi.updateOrganization(id, cleaned)
          .then(saved => replaceOrganization(id, saved))
          .catch(reportFailure)
      } else if (isSupabaseConfigured) {
        void updateOrganizationRow(id, cleaned)
          .then(saved => replaceOrganization(id, saved))
          .catch(reportFailure)
      }
      return { ok: true, id }
    }

    const next: Organization = {
      ...cleaned,
      id: makeId("org"),
      createdAt: today(),
    }
    setOrganizations(current => [next, ...current])
    if (isAdminApiConfigured) {
      void adminApi.createOrganization(cleaned)
        .then(saved => replaceOrganization(next.id, saved))
        .catch(reportFailure)
    } else if (isSupabaseConfigured) {
      void createOrganizationRow(next.id, cleaned)
        .then(saved => replaceOrganization(next.id, saved))
        .catch(reportFailure)
    }
    return { ok: true, id: next.id }
  }

  function toggleOrganization(id: string) {
    const current = organizations.find(organization => organization.id === id)
    const status: OrganizationStatus = current?.status === "active" ? "inactive" : "active"

    setOrganizations(list => list.map(organization =>
      organization.id === id ? { ...organization, status } : organization,
    ))

    if (isAdminApiConfigured) {
      void adminApi.toggleOrganization(id)
        .then(saved => replaceOrganization(id, saved))
        .catch(reportFailure)
    } else if (isSupabaseConfigured) {
      void setOrganizationStatusRow(id, status)
        .then(saved => replaceOrganization(id, saved))
        .catch(reportFailure)
    }
  }

  function deleteOrganization(id: string) {
    if (events.some(event => event.organizationId === id)) return false
    setOrganizations(current => current.filter(organization => organization.id !== id))
    if (isAdminApiConfigured) void adminApi.deleteOrganization(id).catch(reportFailure)
    else if (isSupabaseConfigured) void deleteOrganizationRow(id).catch(reportFailure)
    return true
  }

  function saveEvent(draft: EventDraft, id?: string) {
    if (id) {
      setEvents(current => current.map(event => event.id === id ? { ...event, ...draft } : event))
      if (isAdminApiConfigured) {
        void adminApi.updateEvent(id, draft)
          .then(saved => replaceEvent(id, saved))
          .catch(reportFailure)
      } else if (isSupabaseConfigured) {
        void updateEventRow(id, draft)
          .then(saved => replaceEvent(id, saved))
          .catch(reportFailure)
      }
      return id
    }
    const next: AdminEvent = {
      ...draft,
      id: makeId("event"),
      createdAt: today(),
    }
    setEvents(current => [next, ...current])
    if (isAdminApiConfigured) {
      void adminApi.createEvent(draft)
        .then(saved => replaceEvent(next.id, saved))
        .catch(reportFailure)
    } else if (isSupabaseConfigured) {
      void createEventRow(next.id, draft)
        .then(saved => replaceEvent(next.id, saved))
        .catch(reportFailure)
    }
    return next.id
  }

  function duplicateEvent(id: string) {
    const source = events.find(event => event.id === id)
    if (!source) return null
    const duplicate: AdminEvent = {
      ...source,
      id: makeId("event"),
      title: `${source.title} copy`,
      status: "draft",
      createdAt: today(),
    }
    setEvents(current => [duplicate, ...current])
    if (isAdminApiConfigured) {
      void adminApi.duplicateEvent(id)
        .then(saved => replaceEvent(duplicate.id, saved))
        .catch(reportFailure)
    } else if (isSupabaseConfigured) {
      const { id: _sourceId, createdAt: _createdAt, ...draft } = duplicate
      void createEventRow(duplicate.id, draft)
        .then(saved => replaceEvent(duplicate.id, saved))
        .catch(reportFailure)
    }
    return duplicate.id
  }

  function cancelEvent(id: string) {
    setEvents(current => current.map(event => event.id === id ? { ...event, status: "cancelled" } : event))
    if (isAdminApiConfigured) void adminApi.cancelEvent(id).catch(reportFailure)
    else if (isSupabaseConfigured) {
      void setEventStatusRow(id, "cancelled")
        .then(saved => replaceEvent(id, saved))
        .catch(reportFailure)
    }
  }

  function deleteEvent(id: string) {
    setEvents(current => current.filter(event => event.id !== id))
    if (isAdminApiConfigured) void adminApi.deleteEvent(id).catch(reportFailure)
    else if (isSupabaseConfigured) void deleteEventRow(id).catch(reportFailure)
  }

  function findConflict(draft: EventDraft, editingId?: string) {
    const start = new Date(draft.startsAt).getTime()
    const end = new Date(draft.endsAt).getTime()
    if (!start || !end || end <= start) return null
    return events.find(event => {
      if (event.id === editingId || event.status === "cancelled") return false
      const sameContext =
        event.organizationId === draft.organizationId ||
        (event.location.trim() && event.location.toLowerCase() === draft.location.trim().toLowerCase())
      return sameContext && start < new Date(event.endsAt).getTime() && end > new Date(event.startsAt).getTime()
    }) ?? null
  }

  const metrics = useMemo(() => ({
    activeOrganizations: organizations.filter(organization => organization.status === "active").length,
    publishedEvents: events.filter(event => event.status === "published").length,
    draftEvents: events.filter(event => event.status === "draft").length,
    upcomingEvents: events.filter(event => event.status === "published" && new Date(event.startsAt) > new Date()).length,
  }), [events, organizations])

  return {
    organizations,
    events,
    metrics,
    error,
    loading,
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
