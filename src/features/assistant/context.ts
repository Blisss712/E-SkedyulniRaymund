import { fetchMessages, fetchParticipants } from "../messaging/api"
import type { ChatConversation, ChatParticipant } from "../messaging/types"
import type { AdminEvent } from "../admin/types"
import type { Slot } from "../../shared/slot"
import type { OneTimeOverride, RecurringAvail } from "../availability/types"
import type {
  AssistantFacts,
  AssistantSnapshot,
  GroupMessage,
  SnapshotEvent,
  SnapshotGroup,
} from "./types"

/**
 * Builds the assistant's picture of the member's world: the ministries they
 * joined, their published events, the latest messages in those group chats,
 * open volunteer slots, and their saved availability.
 *
 * Two rules keep answers trustworthy:
 *   1. Only joined ministries are included, even if the events query returned
 *      rows for other organizations.
 *   2. Group messages are read live (with a short cache), not guessed from the
 *      inbox preview.
 */

const MANILA = "Asia/Manila"

const longDateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const weekdayDate = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
})

const shortDay = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  weekday: "short",
  day: "numeric",
  month: "short",
})

const timeOnly = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  hour: "numeric",
  minute: "2-digit",
})

const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const MESSAGE_CACHE_MS = 45_000
const MESSAGE_GROUP_LIMIT = 5
const MESSAGES_PER_GROUP = 12
const MESSAGE_LOAD_TIMEOUT_MS = 6_000

type CachedMessages = {
  at: number
  messages: GroupMessage[]
}

const messageCache = new Map<string, CachedMessages>()

/**
 * The assistant must answer even when a chat query is slow or the messaging
 * tables are not installed, so each group read gets a hard deadline.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Timed out loading group messages."))
    }, ms)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (reason) => {
        window.clearTimeout(timer)
        reject(reason)
      },
    )
  })
}

/** Parses the app's wall-clock values as Asia/Manila time, not the browser's zone. */
export function parseManila(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00+08:00`)
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return new Date(`${trimmed}+08:00`)
  }

  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateKey(date: Date): string {
  return dateKeyFormat.format(date)
}

/** "Sat, Nov 14, 2026, 5:00 PM–7:00 PM" (or a cross-midnight range). */
export function eventTimeLabel(event: AdminEvent): string {
  const start = parseManila(event.startsAt)
  const end = parseManila(event.endsAt)
  if (!start) return "date to be announced"
  if (!end) return `${weekdayDate.format(start)} at ${timeOnly.format(start)}`
  if (dateKey(start) === dateKey(end)) {
    return `${weekdayDate.format(start)}, ${timeOnly.format(start)}–${timeOnly.format(end)}`
  }
  return `${weekdayDate.format(start)}, ${timeOnly.format(start)} to ${weekdayDate.format(end)}, ${timeOnly.format(end)}`
}

function messageStamp(value: string, now: Date): string {
  const date = parseManila(value)
  if (!date) return "unknown time"

  const key = dateKey(date)
  const today = dateKey(now)
  const yesterday = dateKey(new Date(now.getTime() - 86_400_000))

  if (key === today) return `today ${timeOnly.format(date)}`
  if (key === yesterday) return `yesterday ${timeOnly.format(date)}`
  return `${shortDay.format(date)}, ${timeOnly.format(date)}`
}

function slotTimeLabel(slot: Slot): string {
  const date = parseManila(slot.date)
  return date ? `${weekdayDate.format(date)} at ${slot.time}` : `${slot.date} at ${slot.time}`
}

async function loadGroupMessages(
  conversationId: string,
  memberId: string,
): Promise<GroupMessage[]> {
  // `mine` is member-specific, so the cache key includes the member.
  const cacheKey = `${memberId}:${conversationId}`
  const cached = messageCache.get(cacheKey)
  if (cached && Date.now() - cached.at < MESSAGE_CACHE_MS) {
    return cached.messages
  }

  const [messages, participants] = await Promise.all([
    fetchMessages(conversationId),
    fetchParticipants(conversationId).catch(() => [] as ChatParticipant[]),
  ])

  const names = new Map(participants.map((person) => [person.userId, person.fullName]))
  const result = messages.slice(-MESSAGES_PER_GROUP).map<GroupMessage>((message) => ({
    sender:
      message.senderId === memberId
        ? "You"
        : names.get(message.senderId)?.trim() || "A group member",
    body: message.body.replace(/\s+/g, " ").trim().slice(0, 220),
    at: message.createdAt,
    mine: message.senderId === memberId,
  }))

  messageCache.set(cacheKey, { at: Date.now(), messages: result })
  return result
}

/** Reads events, chats, slots, and availability into one snapshot. */
export async function buildSnapshot(
  facts: AssistantFacts,
  now = new Date(),
): Promise<AssistantSnapshot> {
  const joined = facts.ministries.filter((ministry) => !ministry.waiting)
  const joinedIds = new Set(joined.map((ministry) => ministry.id))
  const today = dateKey(now)

  const groupNames = new Map(joined.map((ministry) => [ministry.id, ministry.name]))

  const upcomingEvents: SnapshotEvent[] = facts.events
    .filter(
      (event) =>
        event.status === "published" &&
        joinedIds.has(event.organizationId) &&
        (event.startsAt ?? "").slice(0, 10) >= today,
    )
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""))
    .slice(0, 40)
    .map((event) => ({
      event,
      groupName: groupNames.get(event.organizationId) ?? "Ministry",
    }))

  // Automatic organization chats are keyed by organization id.
  const groupConversations = new Map<string, ChatConversation>()
  for (const conversation of facts.conversations) {
    if (
      conversation.kind === "organization" &&
      conversation.organizationId &&
      joinedIds.has(conversation.organizationId)
    ) {
      groupConversations.set(conversation.organizationId, conversation)
    }
  }

  const groups: SnapshotGroup[] = joined.map((ministry) => {
    const conversation = groupConversations.get(ministry.id) ?? null
    const groupEvents = upcomingEvents
      .filter(({ event }) => event.organizationId === ministry.id)
      .map(({ event }) => event)
    return {
      id: ministry.id,
      name: ministry.name,
      category: ministry.parish,
      unreadCount: conversation?.unreadCount ?? 0,
      conversationId: conversation?.id ?? null,
      events: groupEvents.slice(0, 8),
      eventCount: groupEvents.length,
      messages: [],
      lastMessage: conversation?.lastMessage ?? "",
      lastMessageAt: conversation?.lastMessageAt ?? null,
    }
  })

  const chatGroups = groups
    .filter((group) => group.conversationId)
    .slice(0, MESSAGE_GROUP_LIMIT)

  await Promise.all(
    chatGroups.map(async (group) => {
      try {
        group.messages = await withTimeout(
          loadGroupMessages(group.conversationId!, facts.memberId),
          MESSAGE_LOAD_TIMEOUT_MS,
        )
      } catch {
        // A messaging project that is not set up yet must not break the assistant.
        group.messages = []
      }
    }),
  )

  const upcomingSlots = facts.slots
    .filter((slot) => slot.date >= today)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.time.localeCompare(b.time, "en", { numeric: true }),
    )

  const directChats = facts.conversations
    .filter((conversation) => conversation.kind === "direct")
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
    .slice(0, 5)

  return {
    memberName: facts.memberName,
    now,
    groups,
    pendingMinistries: facts.ministries
      .filter((ministry) => ministry.waiting)
      .map((ministry) => ministry.name),
    upcomingEvents,
    openSlots: upcomingSlots
      .filter((slot) => slot.status === "open" && slot.withinCutoff !== false)
      .slice(0, 10),
    servingSlots: upcomingSlots
      .filter((slot) => slot.status === "serving")
      .slice(0, 5),
    directChats,
    unreadTotal: facts.conversations.reduce(
      (total, conversation) => total + conversation.unreadCount,
      0,
    ),
    recurringAvailability: facts.recurringAvailability,
    overrides: facts.overrides
      .filter((entry) => entry.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

// ─── Serialization for Gemini ────────────────────────────────────────────────

function eventLine({ event, groupName }: SnapshotEvent): string {
  const parts = [`${eventTimeLabel(event)} — "${event.title}"`]
  if (event.location) parts.push(`at ${event.location}`)
  parts.push(`[${groupName}]`)

  const deadline = parseManila(event.registrationDeadline)
  if (deadline) parts.push(`registration by ${shortDay.format(deadline)}`)
  return `- ${parts.join(" ")}`
}

function availabilityLines(
  recurring: RecurringAvail[],
  overrides: OneTimeOverride[],
): string {
  const lines: string[] = []

  if (recurring.length === 0) {
    lines.push("No weekly availability saved.")
  } else {
    for (const entry of recurring) {
      lines.push(
        `- ${entry.days.join(", ")} from ${entry.startTime} to ${entry.endTime}`,
      )
    }
  }

  if (overrides.length > 0) {
    lines.push("Date-specific changes:")
    for (const entry of overrides) {
      lines.push(
        entry.type === "blocked"
          ? `- ${entry.date}: unavailable all day`
          : `- ${entry.date}: free ${entry.startTime ?? ""}–${entry.endTime ?? ""}`,
      )
    }
  }

  return lines.join("\n")
}

/** Compact, clearly delimited data the model may quote but never invent around. */
export function buildDataBlock(snapshot: AssistantSnapshot): string {
  const lines: string[] = [
    "=== MEMBER DATA (read-only, supplied by the app) ===",
    `Member: ${snapshot.memberName}`,
    `Now: ${longDateTime.format(snapshot.now)} (${MANILA})`,
    `Joined ministries: ${snapshot.groups.length}`,
    `Unread messages across all conversations: ${snapshot.unreadTotal}`,
  ]

  if (snapshot.pendingMinistries.length > 0) {
    lines.push(
      `Ministry requests waiting for approval: ${snapshot.pendingMinistries.join(", ")}`,
    )
  }

  lines.push("", "JOINED MINISTRIES:")
  if (snapshot.groups.length === 0) {
    lines.push("- None. The member has not joined a ministry yet.")
  } else {
    for (const group of snapshot.groups) {
      lines.push(
        `- ${group.name} (${group.category}) — ${group.eventCount} upcoming event(s), ${group.unreadCount} unread group message(s)`,
      )
    }
  }

  lines.push("", "UPCOMING EVENTS (joined ministries only, soonest first):")
  if (snapshot.upcomingEvents.length === 0) {
    lines.push("- None upcoming.")
  } else {
    for (const item of snapshot.upcomingEvents.slice(0, 20)) {
      lines.push(eventLine(item))
    }
  }

  lines.push("", "RECENT GROUP CHAT MESSAGES (last 12 per ministry):")
  const chatGroups = snapshot.groups.filter((group) => group.conversationId)
  if (chatGroups.length === 0) {
    lines.push("- No group conversations available.")
  } else {
    for (const group of chatGroups.slice(0, MESSAGE_GROUP_LIMIT)) {
      lines.push(`--- ${group.name} ---`)
      if (group.messages.length === 0) {
        lines.push("- No messages could be loaded.")
      } else {
        for (const message of group.messages) {
          lines.push(
            `- ${messageStamp(message.at, snapshot.now)} — ${message.sender}: "${message.body}"`,
          )
        }
      }
      if (group.lastMessage && group.messages.length === 0) {
        lines.push(`- Inbox preview: "${group.lastMessage.slice(0, 160)}"`)
      }
    }
  }

  lines.push("", "OTHER 1:1 CONVERSATIONS (previews only, no message bodies):")
  if (snapshot.directChats.length === 0) {
    lines.push("- None.")
  } else {
    for (const chat of snapshot.directChats) {
      const preview = chat.lastMessage
        ? `, latest: "${chat.lastMessage.slice(0, 120)}"`
        : ""
      const when = chat.lastMessageAt
        ? ` (${messageStamp(chat.lastMessageAt, snapshot.now)})`
        : ""
      lines.push(
        `- ${chat.title} — ${chat.unreadCount} unread${when}${preview}`,
      )
    }
  }

  lines.push("", "OPEN VOLUNTEER SLOTS (soonest first):")
  if (snapshot.openSlots.length === 0) {
    lines.push("- None open right now.")
  } else {
    for (const slot of snapshot.openSlots) {
      const left = Math.max(0, slot.totalSpots - slot.filledSpots)
      lines.push(
        `- ${slotTimeLabel(slot)} — ${slot.massName}, ${left} spot(s) left`,
      )
    }
  }

  lines.push("", "SLOTS THE MEMBER IS SERVING:")
  if (snapshot.servingSlots.length === 0) {
    lines.push("- None.")
  } else {
    for (const slot of snapshot.servingSlots) {
      lines.push(`- ${slotTimeLabel(slot)} — ${slot.massName}`)
    }
  }

  lines.push("", "MEMBER'S SAVED WEEKLY AVAILABILITY:")
  lines.push(
    availabilityLines(snapshot.recurringAvailability, snapshot.overrides),
  )

  lines.push("=== END DATA ===")
  return lines.join("\n")
}

// ─── Answers without an API key (and fallback when Gemini is unavailable) ────

function bullets(lines: string[]): string {
  return lines.map((line) => `• ${line}`).join("\n")
}

function groupSummary(snapshot: AssistantSnapshot): string {
  return snapshot.groups.map((group) => group.name).join(", ")
}

function noGroupsAnswer(snapshot: AssistantSnapshot): string {
  const pending =
    snapshot.pendingMinistries.length > 0
      ? ` Your request to join ${snapshot.pendingMinistries.join(", ")} is still waiting for approval.`
      : ""
  return `I don't see a ministry on your account yet, ${snapshot.memberName.split(" ")[0] || "there"}.${pending} Once you join a group, I can tell you about its events and group chat.`
}

function eventsAnswer(snapshot: AssistantSnapshot): string {
  if (snapshot.groups.length === 0) return noGroupsAnswer(snapshot)
  if (snapshot.upcomingEvents.length === 0) {
    return `I don't see any upcoming events for ${groupSummary(snapshot)} right now. New events show up on your Availability tab as soon as a coordinator publishes them.`
  }

  const lines = snapshot.upcomingEvents.slice(0, 5).map(({ event, groupName }) => {
    const location = event.location ? ` at ${event.location}` : ""
    return `${eventTimeLabel(event)} — ${event.title}${location} (${groupName})`
  })
  const extra = snapshot.upcomingEvents.length - lines.length

  return `Here's what's next in your ministries:\n${bullets(lines)}${
    extra > 0 ? `\n…and ${extra} more on your Availability tab.` : ""
  }`
}

function messagesAnswer(snapshot: AssistantSnapshot): string {
  if (snapshot.groups.length === 0) return noGroupsAnswer(snapshot)

  const lines: string[] = []
  for (const group of snapshot.groups) {
    for (const message of group.messages.slice(-2)) {
      lines.push(
        `${group.name} — ${message.sender} (${messageStamp(message.at, snapshot.now)}): "${message.body.slice(0, 160)}"`,
      )
    }
  }

  if (lines.length === 0) {
    // Messaging may be temporarily unreadable while the inbox preview is still
    // available; say that instead of pretending the group is silent.
    const previews = snapshot.groups
      .filter((group) => group.lastMessage)
      .slice(0, 3)
      .map(
        (group) => `${group.name}: "${group.lastMessage.slice(0, 140)}"`,
      )

    if (previews.length > 0) {
      return `I only have the latest inbox previews right now:\n${bullets(
        previews,
      )}\nOpen the Messages tab for the full conversation.`
    }

    return `I don't see any recent group messages in ${groupSummary(snapshot)} yet. Open the Messages tab to read the group chat.`
  }

  return `Latest from your group chats:\n${bullets(lines.slice(0, 5))}`
}

function slotsAnswer(snapshot: AssistantSnapshot): string {
  const lines: string[] = []

  if (snapshot.servingSlots.length > 0) {
    lines.push(
      ...snapshot.servingSlots.map(
        (slot) => `You're serving at ${slotTimeLabel(slot)} — ${slot.massName}`,
      ),
    )
  }

  if (snapshot.openSlots.length > 0) {
    lines.push(
      ...snapshot.openSlots.slice(0, 4).map((slot) => {
        const left = Math.max(0, slot.totalSpots - slot.filledSpots)
        return `${slotTimeLabel(slot)} — ${slot.massName}, ${left} spot${left === 1 ? "" : "s"} left`
      }),
    )
    return `Volunteer slots:\n${bullets(lines)}`
  }

  if (lines.length > 0) return `Your serving schedule:\n${bullets(lines)}`

  return "There are no open volunteer slots right now. Check the Open Slots tab again after a coordinator adds new ones."
}

function availabilityAnswer(snapshot: AssistantSnapshot): string {
  const weekly = snapshot.recurringAvailability.map(
    (entry) => `${entry.days.join(", ")}, ${entry.startTime}–${entry.endTime}`,
  )
  const changes = snapshot.overrides.map((entry) =>
    entry.type === "blocked"
      ? `${entry.date}: unavailable all day`
      : `${entry.date}: free ${entry.startTime ?? ""}–${entry.endTime ?? ""}`,
  )

  if (weekly.length === 0 && changes.length === 0) {
    return "You haven't saved any availability yet. Add your weekly schedule or a date-specific change on the Availability tab, and I can help you plan around events."
  }

  const lines: string[] = []
  if (weekly.length > 0) lines.push(...weekly)
  if (changes.length > 0) {
    lines.push(`Changes: ${changes.join("; ")}`)
  }

  return `Your saved availability:\n${bullets(lines)}`
}

function groupsAnswer(snapshot: AssistantSnapshot): string {
  if (snapshot.groups.length === 0) return noGroupsAnswer(snapshot)

  const lines = snapshot.groups.map((group) => {
    const bits: string[] = []
    if (group.eventCount > 0) {
      bits.push(
        `${group.eventCount} upcoming event${group.eventCount === 1 ? "" : "s"}`,
      )
    }
    if (group.unreadCount > 0) {
      bits.push(
        `${group.unreadCount} unread message${group.unreadCount === 1 ? "" : "s"}`,
      )
    }
    return `${group.name} (${group.category})${bits.length ? ` — ${bits.join(", ")}` : ""}`
  })

  const pending =
    snapshot.pendingMinistries.length > 0
      ? `\nStill waiting for approval: ${snapshot.pendingMinistries.join(", ")}.`
      : ""

  return `You're part of ${groupSummary(snapshot)}:\n${bullets(lines)}${pending}`
}

function overviewAnswer(snapshot: AssistantSnapshot): string {
  if (snapshot.groups.length === 0) return noGroupsAnswer(snapshot)

  const nextEvent = snapshot.upcomingEvents[0]
  const latest = snapshot.groups
    .flatMap((group) =>
      group.messages.slice(-1).map((message) => ({ group, message })),
    )
    .sort((a, b) => b.message.at.localeCompare(a.message.at))[0]

  const lines: string[] = []
  if (nextEvent) {
    const location = nextEvent.event.location ? ` at ${nextEvent.event.location}` : ""
    lines.push(
      `Next event: ${eventTimeLabel(nextEvent.event)} — ${nextEvent.event.title}${location} (${nextEvent.groupName})`,
    )
  }
  if (latest) {
    lines.push(
      `Latest group message: ${latest.group.name} — ${latest.message.sender}: "${latest.message.body.slice(0, 120)}"`,
    )
  }
  if (snapshot.openSlots.length > 0) {
    const slot = snapshot.openSlots[0]
    lines.push(`Open slot: ${slotTimeLabel(slot)} — ${slot.massName}`)
  }
  if (snapshot.unreadTotal > 0) {
    lines.push(`${snapshot.unreadTotal} unread message(s) across your inbox`)
  }

  return `Here's a quick look at ${groupSummary(snapshot)}:\n${bullets(
    lines.length > 0 ? lines : ["Nothing new is scheduled right now."],
  )}`
}

/** A useful answer from the saved data alone, with no network request. */
export function answerLocally(
  question: string,
  snapshot: AssistantSnapshot,
): string {
  const text = question.toLowerCase()

  const wantsMessages =
    /\b(messages?|chats?|said|says|announce\w*|posted|conversations?|repl(y|ies))\b/.test(
      text,
    )
  const wantsSlots =
    /\b(slots?|volunteers?|serving|serve|sign[\s-]?up)\b/.test(text)
  const wantsEvents =
    /\b(events?|schedules?|upcoming|calendar|activities|happening|next|when|mass|rehearsal|meeting|assembly|program)\b/.test(
      text,
    )
  const wantsAvailability =
    /\b(free|available|availability|busy|blocked|my time|weekend|saturday|sunday)\b/.test(
      text,
    )
  const wantsGroups =
    /\b(groups?|ministr(y|ies)|joined|members?|parish|organizations?)\b/.test(
      text,
    )

  if (wantsMessages) return messagesAnswer(snapshot)
  if (wantsEvents) return eventsAnswer(snapshot)
  if (wantsSlots) return slotsAnswer(snapshot)
  if (wantsAvailability) return availabilityAnswer(snapshot)
  if (wantsGroups) return groupsAnswer(snapshot)
  return overviewAnswer(snapshot)
}

export function buildGreeting(facts: AssistantFacts): string {
  const firstName = facts.memberName.trim().split(/\s+/)[0] || "there"
  const joined = facts.ministries.filter((ministry) => !ministry.waiting)
  const names = joined.slice(0, 2).map((ministry) => ministry.name)

  if (names.length === 0) {
    return `Hi ${firstName}! I'm your ministry assistant. Once you join a ministry I can tell you about its events, group messages, and volunteer slots.`
  }

  return `Hi ${firstName}! I can help with ${
    names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`
  } — events, group messages, volunteer slots, and availability.`
}

export function suggestedQuestions(facts: AssistantFacts): string[] {
  const joined = facts.ministries.filter((ministry) => !ministry.waiting)
  const first = joined[0]?.name

  return [
    first ? `What's next in ${first}?` : "What's happening this week?",
    "Summarize my latest group messages",
    "Any open volunteer slots?",
  ]
}
