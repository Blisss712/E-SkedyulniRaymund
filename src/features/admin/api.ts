import type { AdminEvent, EventDraft, JoinRequest, Organization, OrganizationDraft } from "./types"
import { memberApi } from "../../lib/memberApi"

const API_URL = (import.meta.env.VITE_ADMIN_API_URL as string | undefined)?.replace(/\/$/, "")
const TOKEN_KEY = "e-skedyul.admin-token"

export const isAdminApiConfigured = Boolean(API_URL)

type ApiOptions = RequestInit & { token?: string }

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  if (!API_URL) throw new Error("Admin API is not configured.")
  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")
  const token = options.token ?? getAdminToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.detail || "The admin service could not complete the request.")
  }
  return body as T
}

export function getAdminToken() {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function clearAdminToken() {
  window.localStorage.removeItem(TOKEN_KEY)
}

export async function logoutAdmin() {
  if (API_URL && getAdminToken()) {
    await request("/admin/auth/logout", { method: "POST" }).catch(() => undefined)
  }
  clearAdminToken()
}

export async function loginAdmin(username: string, password: string) {
  const result = await request<{ access_token: string; user: unknown }>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    token: "",
  })
  window.localStorage.setItem(TOKEN_KEY, result.access_token)
  return result
}

export async function loadAdminData() {
  const [organizations, events] = await Promise.all([
    request<Organization[]>("/admin/organizations"),
    request<AdminEvent[]>("/admin/events"),
  ])
  return { organizations, events }
}

export async function loadJoinRequests() {
  return request<JoinRequest[]>("/admin/join-requests")
}

export async function createJoinRequest(input: Omit<JoinRequest, "id" | "status" | "requestedAt">) {
  return memberApi.createJoinRequest({
    memberName: input.memberName,
    groupCode: input.groupCode,
  })
}

export async function loadJoinRequest(id: string) {
  return memberApi.getJoinRequest(id)
}

export async function updateJoinRequest(id: string, status: "approved" | "rejected") {
  return request<JoinRequest>(`/admin/join-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}

export const adminApi = {
  createOrganization: (draft: OrganizationDraft) =>
    request<Organization>("/admin/organizations", { method: "POST", body: JSON.stringify(draft) }),
  updateOrganization: (id: string, draft: OrganizationDraft) =>
    request<Organization>(`/admin/organizations/${id}`, { method: "PUT", body: JSON.stringify(draft) }),
  toggleOrganization: (id: string) =>
    request<Organization>(`/admin/organizations/${id}/toggle-status`, { method: "PATCH" }),
  deleteOrganization: (id: string) =>
    request<{ message: string }>(`/admin/organizations/${id}`, { method: "DELETE" }),
  createEvent: (draft: EventDraft) =>
    request<AdminEvent>("/admin/events", { method: "POST", body: JSON.stringify(draft) }),
  updateEvent: (id: string, draft: EventDraft) =>
    request<AdminEvent>(`/admin/events/${id}`, { method: "PUT", body: JSON.stringify(draft) }),
  duplicateEvent: (id: string) =>
    request<AdminEvent>(`/admin/events/${id}/duplicate`, { method: "POST" }),
  cancelEvent: (id: string) =>
    request<AdminEvent>(`/admin/events/${id}/cancel`, { method: "POST" }),
  deleteEvent: (id: string) =>
    request<{ message: string }>(`/admin/events/${id}`, { method: "DELETE" }),
}
