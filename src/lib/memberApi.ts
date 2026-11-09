import { isSupabaseConfigured, supabase } from "./supabase"

const API_URL = (
  import.meta.env.VITE_MEMBER_API_URL ||
  import.meta.env.VITE_ADMIN_API_URL ||
  ""
).replace(/\/$/, "")

export const isMemberApiConfigured = Boolean(API_URL && isSupabaseConfigured)

export type MemberRecurringAvailability = {
  id: string
  days: string[]
  startTime: string
  endTime: string
}

export type MemberAvailabilityOverride = {
  id: string
  date: string
  type: "free" | "blocked"
  startTime: string | null
  endTime: string | null
}

export type MemberSlot = {
  id: string
  date: string
  time: string
  massName: string
  totalSpots: number
  filledSpots: number
  status: "open" | "serving" | "filled"
}

export type MemberNotification = {
  id: string
  title: string
  message: string
  kind: "schedule" | "approval" | "slot" | "event" | "event_reminder"
  readAt: string | null
  createdAt: string
}

export type MemberJoinRequest = {
  id: string
  memberName: string
  groupCode: string
  groupName: string
  status: "pending" | "approved" | "rejected"
  requestedAt: string
  reviewedAt: string | null
}

export type MemberGroup = {
  id: string
  name: string
  category: string
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error("Member API is not configured.")

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error("Sign in to access member data.")
  }

  const headers = new Headers(options.headers)
  headers.set("Authorization", `Bearer ${session.access_token}`)
  if (options.body) headers.set("Content-Type", "application/json")

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? (body as { detail?: unknown }).detail
        : null
    throw new Error(typeof detail === "string" ? detail : "The member service could not complete the request.")
  }
  return body as T
}

export const memberApi = {
  getAvailability: () =>
    request<{
      recurring: MemberRecurringAvailability[]
      overrides: MemberAvailabilityOverride[]
    }>("/member/availability"),
  saveRecurringAvailability: (entry: MemberRecurringAvailability) =>
    request<MemberRecurringAvailability>("/member/availability/recurring", {
      method: "PUT",
      body: JSON.stringify(entry),
    }),
  deleteRecurringAvailability: (id: string) =>
    request(`/member/availability/recurring/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  saveAvailabilityOverride: (entry: MemberAvailabilityOverride) =>
    request<MemberAvailabilityOverride>("/member/availability/overrides", {
      method: "PUT",
      body: JSON.stringify(entry),
    }),
  deleteAvailabilityOverride: (id: string) =>
    request(`/member/availability/overrides/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getSlots: () => request<MemberSlot[]>("/member/slots"),
  volunteerForSlot: (id: string) =>
    request(`/member/slots/${encodeURIComponent(id)}/signup`, { method: "POST" }),
  cancelSlotSignup: (id: string) =>
    request(`/member/slots/${encodeURIComponent(id)}/signup`, { method: "DELETE" }),
  getAssignments: () => request<Assignment[]>("/member/assignments"),
  lookupGroup: (code: string) =>
    request<MemberGroup>(`/member/join-requests/groups/${encodeURIComponent(code)}`),
  createJoinRequest: (input: { memberName: string; groupCode: string }) =>
    request<MemberJoinRequest>("/member/join-requests", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getJoinRequest: (id: string) =>
    request<MemberJoinRequest>(`/member/join-requests/${encodeURIComponent(id)}`),
  getNotifications: () => request<MemberNotification[]>("/member/notifications"),
  createNotification: (input: Pick<MemberNotification, "title" | "message" | "kind">) =>
    request<MemberNotification>("/member/notifications", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  markAllNotificationsRead: () =>
    request("/member/notifications/read", { method: "PATCH" }),
  markNotificationRead: (id: string) =>
    request(`/member/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    }),
  deleteNotification: (id: string) =>
    request(`/member/notifications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  clearNotifications: () =>
    request("/member/notifications", { method: "DELETE" }),
}

type Assignment = {
  id: string
  date: string
  time: string
  massName: string
  role: string
}
