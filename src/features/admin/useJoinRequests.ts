import { useEffect, useState } from "react"
import type { JoinRequest, JoinRequestStatus } from "./types"
import {
  createJoinRequest as createJoinRequestApi,
  isAdminApiConfigured,
  loadJoinRequests,
  updateJoinRequest,
} from "./api"
import { isMemberApiConfigured, memberApi } from "../../lib/memberApi"
import { isSupabaseConfigured } from "../../lib/supabase"
import { useAuth } from "../auth/AuthContext"
import {
  createJoinRequestRow,
  fetchJoinRequest,
  fetchJoinRequests,
  reviewJoinRequest,
} from "../organizations/api"

let requestSequence = 0

function makeId() {
  // Several requests can be created in the same millisecond (one per ticked
  // ministry), so the timestamp alone is not unique.
  requestSequence += 1
  return `request-${Date.now().toString(36)}-${requestSequence}`
}

const STORAGE_KEY = "e-skedyul.join-requests"

/** True when requests live in a database rather than in this browser. */
const remoteRequests = isAdminApiConfigured || isSupabaseConfigured

function readRequests(): JoinRequest[] {
  if (typeof window === "undefined") return []
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as JoinRequest[] : []
  } catch {
    return []
  }
}

/**
 * Join requests are what connect a member to an organization, so they are read
 * from and written to the same rows the admin workspace manages:
 *
 *   organization_join_requests - the request and its status
 *   organization_member_accounts - the membership created when it is approved
 */
export function useJoinRequests() {
  const { user, profile } = useAuth()
  // A coordinator reviews only the ministries they lead. The database RLS
  // policy enforces the same scope; this is also what the query asks for.
  const isCoordinator = profile?.role === "leader"
  const coordinatorOrganizationIds = isCoordinator
    ? (profile?.leaderOrganizations ?? []).map(organization => organization.id)
    : undefined
  const [requests, setRequests] = useState<JoinRequest[]>(() => (remoteRequests ? [] : readRequests()))
  const [apiError, setApiError] = useState("")

  useEffect(() => {
    if (remoteRequests) return
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
  }, [requests])

  useEffect(() => {
    if (remoteRequests) return
    if (typeof window === "undefined") return
    function sync(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      setRequests(readRequests())
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  function replace(id: string, saved: JoinRequest) {
    setRequests(current => current.map(item => (item.id === id ? saved : item)))
  }

  /** Reads the requests from whichever backend is in use, without clearing errors. */
  async function pull() {
    if (isAdminApiConfigured && !isCoordinator) setRequests(await loadJoinRequests())
    else if (isSupabaseConfigured) {
      setRequests(await fetchJoinRequests(coordinatorOrganizationIds))
    }
  }

  async function refresh() {
    try {
      if (!isAdminApiConfigured && !isSupabaseConfigured) return
      await pull()
      setApiError("")
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : "Unable to load join requests.")
    }
  }

  async function refreshRequest(id: string) {
    // `request-` ids only exist in this browser's offline copy.
    if (id.startsWith("request-")) return
    if (!isMemberApiConfigured && !isSupabaseConfigured) return
    try {
      const saved = isMemberApiConfigured
        ? await memberApi.getJoinRequest(id)
        : await fetchJoinRequest(id)
      replace(id, saved)
      setApiError("")
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : "Unable to refresh join request.")
    }
  }

  async function createRequest(input: Omit<JoinRequest, "id" | "status" | "requestedAt">) {
    if (isMemberApiConfigured) {
      try {
        const saved = await createJoinRequestApi(input)
        setRequests(current => [saved, ...current])
        setApiError("")
        return saved.id
      } catch (reason) {
        setApiError(reason instanceof Error ? reason.message : "Unable to submit join request.")
        throw reason
      }
    }

    if (isSupabaseConfigured && user) {
      if (!input.organizationId) {
        throw new Error(
          "We couldn't match that group code to an organization. Ask your group leader for the current code, then try again.",
        )
      }
      try {
        const saved = await createJoinRequestRow({
          memberName: input.memberName,
          organizationId: input.organizationId,
          groupCode: input.groupCode,
          userId: user.id,
        })
        setRequests(current => [saved, ...current.filter(item => item.id !== saved.id)])
        setApiError("")
        return saved.id
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Unable to submit join request."
        setApiError(message)
        throw new Error(message)
      }
    }

    // With a backend connected the request must be written there. Falling back
    // to an in-memory row would report success for something never sent.
    if (remoteRequests) {
      const message = "Sign in again to submit a join request."
      setApiError(message)
      throw new Error(message)
    }

    const request: JoinRequest = {
      ...input,
      id: makeId(),
      status: "pending",
      requestedAt: new Date().toISOString(),
    }
    setRequests(current => [request, ...current])
    return request.id
  }

  function updateRequest(id: string, status: Exclude<JoinRequestStatus, "pending">) {
    setRequests(current => current.map(request =>
      request.id === id
        ? { ...request, status, reviewedAt: new Date().toISOString() }
        : request,
    ))

    if (isAdminApiConfigured && !isCoordinator) {
      void updateJoinRequest(id, status)
        .then(saved => replace(id, saved))
        .catch(reason => failUpdate(reason))
    } else if (isSupabaseConfigured && user) {
      // Approving also inserts the membership row, so the member's dashboard
      // picks the organization up on its next refresh. A coordinator's decision
      // goes through the validating RPC, never a direct table write.
      void reviewJoinRequest(id, status, user.id, { coordinator: isCoordinator })
        .then(saved => replace(id, saved))
        .catch(reason => failUpdate(reason))
    } else if (remoteRequests) {
      // The row was updated optimistically above, but no backend call was made.
      // Put the server's version back and explain why.
      setApiError("Sign in again to review this join request.")
      void pull().catch(() => undefined)
    }
  }

  /** Reports a failed decision and restores the server's version of the request. */
  function failUpdate(reason: unknown) {
    setApiError(reason instanceof Error ? reason.message : "Unable to update join request.")
    void pull().catch(() => undefined)
  }

  return {
    requests,
    apiError,
    refresh,
    refreshRequest,
    createRequest,
    approveRequest: (id: string) => updateRequest(id, "approved"),
    rejectRequest: (id: string) => updateRequest(id, "rejected"),
  }
}
