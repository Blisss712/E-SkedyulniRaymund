import { useEffect, useState } from "react"
import type { JoinRequest, JoinRequestStatus } from "./types"
import {
  createJoinRequest as createJoinRequestApi,
  isAdminApiConfigured,
  loadJoinRequests,
  updateJoinRequest,
} from "./api"
import { isMemberApiConfigured, memberApi } from "../../lib/memberApi"

function makeId() {
  return `request-${Date.now().toString(36)}`
}

const STORAGE_KEY = "e-skedyul.join-requests"

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

export function useJoinRequests() {
  const [requests, setRequests] = useState<JoinRequest[]>(readRequests)
  const [apiError, setApiError] = useState("")

  useEffect(() => {
    if (isAdminApiConfigured) return
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
  }, [requests])

  async function refresh() {
    if (!isAdminApiConfigured) return
    try {
      setRequests(await loadJoinRequests())
      setApiError("")
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : "Unable to load join requests.")
    }
  }

  async function refreshRequest(id: string) {
    if (!isMemberApiConfigured || id.startsWith("request-")) return
    try {
      const saved = await memberApi.getJoinRequest(id)
      setRequests(current => current.map(item => item.id === id ? saved : item))
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : "Unable to refresh join request.")
    }
  }

  useEffect(() => {
    if (isAdminApiConfigured) return
    if (typeof window === "undefined") return
    function sync(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      setRequests(readRequests())
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  async function createRequest(input: Omit<JoinRequest, "id" | "status" | "requestedAt">) {
    const request: JoinRequest = {
      ...input,
      id: makeId(),
      status: "pending",
      requestedAt: new Date().toISOString(),
    }
    if (isMemberApiConfigured) {
      try {
        const saved = await createJoinRequestApi(input)
        setRequests(current => [saved, ...current.filter(item => item.id !== request.id)])
        setApiError("")
        return saved.id
      } catch (reason) {
        setApiError(reason instanceof Error ? reason.message : "Unable to submit join request.")
        throw reason
      }
    } else {
      setRequests(current => [request, ...current])
      return request.id
    }
  }

  function updateRequest(id: string, status: Exclude<JoinRequestStatus, "pending">) {
    setRequests(current => current.map(request =>
      request.id === id
        ? { ...request, status, reviewedAt: new Date().toISOString() }
        : request,
    ))
    if (isAdminApiConfigured) {
      void updateJoinRequest(id, status)
        .then(saved => setRequests(current => current.map(item => item.id === id ? saved : item)))
        .catch(reason => setApiError(reason instanceof Error ? reason.message : "Unable to update join request."))
    }
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
