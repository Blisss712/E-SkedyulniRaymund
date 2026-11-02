import { useEffect, useState } from "react"
import type { JoinRequest, JoinRequestStatus } from "./types"

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

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
  }, [requests])

  useEffect(() => {
    if (typeof window === "undefined") return
    function sync(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      setRequests(readRequests())
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  function createRequest(input: Omit<JoinRequest, "id" | "status" | "requestedAt">) {
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
  }

  return {
    requests,
    createRequest,
    approveRequest: (id: string) => updateRequest(id, "approved"),
    rejectRequest: (id: string) => updateRequest(id, "rejected"),
  }
}
