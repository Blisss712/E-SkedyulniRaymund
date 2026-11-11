import type { Ministry } from "../../shared/home"
import type { Slot } from "../../shared/slot"
import type { AdminEvent } from "../admin/types"
import type { ChatConversation } from "../messaging/types"
import type { OneTimeOverride, RecurringAvail } from "../availability/types"

/**
 * Everything the ministry assistant may talk about. The dashboard already
 * loads these pieces, so the assistant reuses them instead of querying the
 * same tables again.
 */
export type AssistantFacts = {
  memberId: string
  memberName: string
  /** Approved memberships (waiting requests are listed separately). */
  ministries: Ministry[]
  /** Published events; the snapshot keeps only the member's joined groups. */
  events: AdminEvent[]
  conversations: ChatConversation[]
  slots: Slot[]
  recurringAvailability: RecurringAvail[]
  overrides: OneTimeOverride[]
}

export type AssistantTurn = {
  role: "user" | "model"
  text: string
}

/** Where a reply came from: the assistant backend or the saved data. */
export type AssistantSource = "server" | "local"

export type AssistantReply = {
  text: string
  source: AssistantSource
  /** The model that produced a server answer, for an honest label. */
  model?: string
  /** A short, friendly reason shown under the answer when a fallback was used. */
  notice?: string
}

export type GroupMessage = {
  sender: string
  body: string
  /** ISO timestamp. */
  at: string
  mine: boolean
}

export type SnapshotGroup = {
  id: string
  name: string
  category: string
  unreadCount: number
  conversationId: string | null
  events: AdminEvent[]
  /** Total upcoming events, even when only a few are kept for the prompt. */
  eventCount: number
  messages: GroupMessage[]
  lastMessage: string
  lastMessageAt: string | null
}

export type SnapshotEvent = {
  event: AdminEvent
  groupName: string
}

/** A grounded, read-only view of the member's app data for one question. */
export type AssistantSnapshot = {
  memberName: string
  now: Date
  groups: SnapshotGroup[]
  pendingMinistries: string[]
  upcomingEvents: SnapshotEvent[]
  openSlots: Slot[]
  servingSlots: Slot[]
  directChats: ChatConversation[]
  unreadTotal: number
  recurringAvailability: RecurringAvail[]
  overrides: OneTimeOverride[]
}
