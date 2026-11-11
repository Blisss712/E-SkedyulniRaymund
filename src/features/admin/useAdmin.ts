import { useEffect, useMemo, useState } from "react"
import { INITIAL_EVENTS, INITIAL_ORGANIZATIONS } from "./data"
import type { AdminEvent, EventDraft, Organization, OrganizationDraft, OrganizationStatus } from "./types"
import { adminApi, isAdminApiConfigured, loadAdminData } from "./api"
import { isSupabaseConfigured } from "../../lib/supabase"
import { useAuth } from "../auth/AuthContext"
import { notifyEventsChanged } from "./eventsSync"
import { eventSchedule, scheduleIssue, schedulesOverlap } from "./eventSchedule"
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

/** A local `YYYY-MM-DD` key, so "created today" does not become yesterday in UTC+8. */
function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
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

export type AdminScope = {
  /**
   * When set, the workspace is a coordinator's: only these ministries and their
   * events are listed, and writes outside them are refused. Leaving it
   * undefined opens the full administrator workspace.
   */
  organizationIds?: string[]
}

export function useAdmin(scope: AdminScope = {}) {
  const { user } = useAuth()
  const userId = user?.id ?? ""

  // The array is rebuilt on every render by some callers, so depend on its
  // contents rather than its identity.
  const scopeKey = scope.organizationIds ? [...scope.organizationIds].sort().join(",") : ""
  const scopedIds = useMemo(
    () => (scope.organizationIds ? new Set(scope.organizationIds) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  )
  const isScoped = scopedIds !== null
  // A coordinator's workspace always reads Supabase directly: the optional
  // FastAPI backend has no coordinator concept (and no token for one).
  const useRemoteApi = isAdminApiConfigured && !isScoped

  function inScope(organizationId: string) {
    return !scopedIds || scopedIds.has(organizationId)
  }

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
    if (useRemoteApi) {
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
        if (useRemoteApi) {
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
  }, [userId, useRemoteApi])

  function replaceOrganization(pendingId: string, saved: Organization) {
    setOrganizations(current => current.map(item => (item.id === pendingId ? saved : item)))
  }

  function replaceEvent(pendingId: string, saved: AdminEvent) {
    setEvents(current => current.map(item => (item.id === pendingId ? saved : item)))
  }

  function saveOrganization(draft: OrganizationDraft, id?: string) {
    if (isScoped) {
      return { ok: false, message: "Only an administrator can create or edit ministries." }
    }

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
      if (useRemoteApi) {
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
    if (useRemoteApi) {
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
    if (isScoped) return

    const current = organizations.find(organization => organization.id === id)
    const status: OrganizationStatus = current?.status === "active" ? "inactive" : "active"

    setOrganizations(list => list.map(organization =>
      organization.id === id ? { ...organization, status } : organization,
    ))

    if (useRemoteApi) {
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
    if (isScoped) return false
    if (events.some(event => event.organizationId === id)) return false
    setOrganizations(current => current.filter(organization => organization.id !== id))
    if (useRemoteApi) void adminApi.deleteOrganization(id).catch(reportFailure)
    else if (isSupabaseConfigured) void deleteOrganizationRow(id).catch(reportFailure)
    return true
  }

  function saveEvent(
    draft: EventDraft,
    id?: string,
  ): { ok: boolean; id?: string; message?: string } {
    if (!inScope(draft.organizationId)) {
      return {
        ok: false,
        message: "You can only schedule events for a ministry you coordinate.",
      }
    }

    if (id) {
      setEvents(current => current.map(event => event.id === id ? { ...event, ...draft } : event))
      if (useRemoteApi) {
        void adminApi.updateEvent(id, draft)
          .then(saved => replaceEvent(id, saved))
          .catch(reportFailure)
          .finally(notifyEventsChanged)
      } else if (isSupabaseConfigured) {
        void updateEventRow(id, draft)
          .then(saved => replaceEvent(id, saved))
          .catch(reportFailure)
          .finally(notifyEventsChanged)
      } else {
        notifyEventsChanged()
      }
      return { ok: true, id }
    }
    const next: AdminEvent = {
      ...draft,
      id: makeId("event"),
      createdAt: today(),
    }
    setEvents(current => [next, ...current])
    if (useRemoteApi) {
      void adminApi.createEvent(draft)
        .then(saved => replaceEvent(next.id, saved))
        .catch(reportFailure)
        .finally(notifyEventsChanged)
    } else if (isSupabaseConfigured) {
      void createEventRow(next.id, draft)
        .then(saved => replaceEvent(next.id, saved))
        .catch(reportFailure)
        .finally(notifyEventsChanged)
    } else {
      notifyEventsChanged()
    }
    return { ok: true, id: next.id }
  }

  /**
   * Copies an event and resolves with the id the saved row actually has. The
   * optional API assigns its own id, so callers must not assume the temporary
   * one survives; the duplicate's edit form needs the real id.
   */
  async function duplicateEvent(id: string): Promise<string | null> {
    const source = events.find(event => event.id === id)
    if (!source || !inScope(source.organizationId)) return null
    const duplicate: AdminEvent = {
      ...source,
      id: makeId("event"),
      title: `${source.title} copy`,
      status: "draft",
      createdAt: today(),
    }
    setEvents(current => [duplicate, ...current])

    if (useRemoteApi) {
      try {
        const saved = await adminApi.duplicateEvent(id)
        replaceEvent(duplicate.id, saved)
        return saved.id
      } catch (reason) {
        reportFailure(reason)
        return null
      } finally {
        notifyEventsChanged()
      }
    }

    if (isSupabaseConfigured) {
      const { id: _sourceId, createdAt: _createdAt, ...draft } = duplicate
      try {
        const saved = await createEventRow(duplicate.id, draft)
        replaceEvent(duplicate.id, saved)
        return saved.id
      } catch (reason) {
        reportFailure(reason)
        return null
      } finally {
        notifyEventsChanged()
      }
    }

    notifyEventsChanged()
    return duplicate.id
  }

  function cancelEvent(id: string) {
    const source = events.find(event => event.id === id)
    if (!source || !inScope(source.organizationId)) return
    setEvents(current => current.map(event => event.id === id ? { ...event, status: "cancelled" } : event))
    if (useRemoteApi) {
      void adminApi.cancelEvent(id).catch(reportFailure).finally(notifyEventsChanged)
    } else if (isSupabaseConfigured) {
      void setEventStatusRow(id, "cancelled")
        .then(saved => replaceEvent(id, saved))
        .catch(reportFailure)
        .finally(notifyEventsChanged)
    } else {
      notifyEventsChanged()
    }
  }

  function deleteEvent(id: string) {
    const source = events.find(event => event.id === id)
    if (!source || !inScope(source.organizationId)) return
    setEvents(current => current.filter(event => event.id !== id))
    if (useRemoteApi) {
      void adminApi.deleteEvent(id).catch(reportFailure).finally(notifyEventsChanged)
    } else if (isSupabaseConfigured) {
      void deleteEventRow(id).catch(reportFailure).finally(notifyEventsChanged)
    } else {
      notifyEventsChanged()
    }
  }

  function findConflict(draft: EventDraft, editingId?: string) {
    const schedule = eventSchedule(draft)
    if (scheduleIssue(schedule)) return null
    return visibleEvents.find(event => {
      if (event.id === editingId || event.status === "cancelled") return false
      const sameContext =
        event.organizationId === draft.organizationId ||
        (event.location.trim() && event.location.toLowerCase() === draft.location.trim().toLowerCase())
      if (!sameContext) return false
      const other = eventSchedule(event)
      if (scheduleIssue(other)) return false
      return schedulesOverlap(schedule, other)
    }) ?? null
  }

  const visibleOrganizations = useMemo(
    () => (scopedIds ? organizations.filter(organization => scopedIds.has(organization.id)) : organizations),
    [organizations, scopedIds],
  )

  const visibleEvents = useMemo(
    () => (scopedIds ? events.filter(event => scopedIds.has(event.organizationId)) : events),
    [events, scopedIds],
  )

  const metrics = useMemo(() => ({
    activeOrganizations: visibleOrganizations.filter(organization => organization.status === "active").length,
    publishedEvents: visibleEvents.filter(event => event.status === "published").length,
    draftEvents: visibleEvents.filter(event => event.status === "draft").length,
    // An event that is already running stays "upcoming" until it ends, which
    // matters for events that span several days.
    upcomingEvents: visibleEvents.filter(event => event.status === "published" && new Date(event.endsAt) > new Date()).length,
  }), [visibleEvents, visibleOrganizations])

  return {
    organizations: visibleOrganizations,
    events: visibleEvents,
    scoped: isScoped,
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
