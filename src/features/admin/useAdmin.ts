import { useEffect, useMemo, useState } from "react"
import { INITIAL_EVENTS, INITIAL_ORGANIZATIONS } from "./data"
import type { AdminEvent, EventDraft, Organization, OrganizationDraft } from "./types"
import { adminApi, isAdminApiConfigured, loadAdminData } from "./api"

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}

export function useAdmin() {
  const [organizations, setOrganizations] = useState(INITIAL_ORGANIZATIONS)
  const [events, setEvents] = useState(INITIAL_EVENTS)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isAdminApiConfigured) return
    void loadAdminData()
      .then(data => {
        setOrganizations(data.organizations)
        setEvents(data.events)
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Unable to load admin data."))
  }, [])

  function reportFailure(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "The admin service could not complete the request.")
  }

  function saveOrganization(draft: OrganizationDraft, id?: string) {
    const duplicate = organizations.some(
      organization => organization.id !== id && organization.name.toLowerCase() === draft.name.trim().toLowerCase(),
    )
    if (duplicate) return { ok: false, message: "An organization with this name already exists." }

    if (id) {
      setOrganizations(current => current.map(organization =>
        organization.id === id ? { ...organization, ...draft, name: draft.name.trim() } : organization,
      ))
      if (isAdminApiConfigured) {
        void adminApi.updateOrganization(id, { ...draft, name: draft.name.trim() })
          .then(saved => setOrganizations(current => current.map(item => item.id === id ? saved : item)))
          .catch(reportFailure)
      }
      return { ok: true, id }
    }

    const next: Organization = {
      ...draft,
      id: makeId("org"),
      name: draft.name.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
    }
    setOrganizations(current => [next, ...current])
    if (isAdminApiConfigured) {
      void adminApi.createOrganization({ ...draft, name: draft.name.trim() })
        .then(saved => setOrganizations(current => current.map(item => item.id === next.id ? saved : item)))
        .catch(reportFailure)
    }
    return { ok: true, id: next.id }
  }

  function toggleOrganization(id: string) {
    setOrganizations(current => current.map(organization =>
      organization.id === id
        ? { ...organization, status: organization.status === "active" ? "inactive" : "active" }
        : organization,
    ))
    if (isAdminApiConfigured) void adminApi.toggleOrganization(id).catch(reportFailure)
  }

  function deleteOrganization(id: string) {
    if (events.some(event => event.organizationId === id)) return false
    setOrganizations(current => current.filter(organization => organization.id !== id))
    if (isAdminApiConfigured) void adminApi.deleteOrganization(id).catch(reportFailure)
    return true
  }

  function saveEvent(draft: EventDraft, id?: string) {
    if (id) {
      setEvents(current => current.map(event => event.id === id ? { ...event, ...draft } : event))
      if (isAdminApiConfigured) {
        void adminApi.updateEvent(id, draft)
          .then(saved => setEvents(current => current.map(item => item.id === id ? saved : item)))
          .catch(reportFailure)
      }
      return id
    }
    const next: AdminEvent = {
      ...draft,
      id: makeId("event"),
      createdAt: new Date().toISOString().slice(0, 10),
    }
    setEvents(current => [next, ...current])
    if (isAdminApiConfigured) {
      void adminApi.createEvent(draft)
        .then(saved => setEvents(current => current.map(item => item.id === next.id ? saved : item)))
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
      createdAt: new Date().toISOString().slice(0, 10),
    }
    setEvents(current => [duplicate, ...current])
    if (isAdminApiConfigured) {
      void adminApi.duplicateEvent(id)
        .then(saved => setEvents(current => current.map(item => item.id === duplicate.id ? saved : item)))
        .catch(reportFailure)
    }
    return duplicate.id
  }

  function cancelEvent(id: string) {
    setEvents(current => current.map(event => event.id === id ? { ...event, status: "cancelled" } : event))
    if (isAdminApiConfigured) void adminApi.cancelEvent(id).catch(reportFailure)
  }

  function deleteEvent(id: string) {
    setEvents(current => current.filter(event => event.id !== id))
    if (isAdminApiConfigured) void adminApi.deleteEvent(id).catch(reportFailure)
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
