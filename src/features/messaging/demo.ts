import type {
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  ChatPerson,
} from "./types"

/**
 * The offline demo used when no Supabase project is configured. It exists so the
 * Messages tab can be explored in the Figma Make preview; a configured project
 * always reads and writes the real tables (`supabase/messaging.sql`).
 */

export const DEMO_ME_ID = "demo-me"

export const DEMO_PEOPLE: ChatPerson[] = [
  {
    userId: "demo-maria",
    fullName: "Maria Santos",
    maskedEmail: "m***@example.org",
    sharedOrganization: "Parish Music Ministry",
  },
  {
    userId: "demo-juan",
    fullName: "Juan dela Cruz",
    maskedEmail: "j***@example.org",
    sharedOrganization: "Altar Servers",
  },
  {
    userId: "demo-ana",
    fullName: "Ana Reyes",
    maskedEmail: "a***@example.org",
    sharedOrganization: "Youth Ministry",
  },
  {
    userId: "demo-ramon",
    fullName: "Fr. Ramon Cruz",
    maskedEmail: "r***@example.org",
    sharedOrganization: "",
  },
]

const DEMO_GROUP_ID = "demo-org-music"

const DEMO_DIRECT_IDS: Record<string, string> = {
  "demo-maria": "demo-direct-maria",
  "demo-juan": "demo-direct-juan",
  "demo-ana": "demo-direct-ana",
  "demo-ramon": "demo-direct-ramon",
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

const BASE_CONVERSATIONS: ChatConversation[] = [
  {
    id: DEMO_GROUP_ID,
    kind: "organization",
    title: "Parish Music Ministry",
    organizationId: "org-choir",
    otherUserId: null,
    otherUserName: null,
    otherUserEmail: null,
    lastMessage: "Rehearsal moved to 6 PM this Saturday.",
    lastMessageAt: minutesAgo(34),
    unreadCount: 2,
    memberCount: 9,
  },
  {
    id: "demo-direct-maria",
    kind: "direct",
    title: "Maria Santos",
    organizationId: null,
    otherUserId: "demo-maria",
    otherUserName: "Maria Santos",
    otherUserEmail: "m***@example.org",
    lastMessage: "Thank you! See you Sunday.",
    lastMessageAt: minutesAgo(120),
    unreadCount: 0,
    memberCount: 2,
  },
  {
    id: "demo-direct-ramon",
    kind: "direct",
    title: "Fr. Ramon Cruz",
    organizationId: null,
    otherUserId: "demo-ramon",
    otherUserName: "Fr. Ramon Cruz",
    otherUserEmail: "r***@example.org",
    lastMessage: "Please send me the final list of volunteers.",
    lastMessageAt: minutesAgo(1_500),
    unreadCount: 0,
    memberCount: 2,
  },
]

const STORAGE_KEY = "e-skedyul-demo-chat"

type DemoStore = Record<string, ChatMessage[]>

function seedMessages(conversationId: string): ChatMessage[] {
  if (conversationId === DEMO_GROUP_ID) {
    return [
      {
        id: "demo-msg-1",
        conversationId,
        senderId: "demo-maria",
        body: "Good evening! Are we still rehearsing on Saturday?",
        createdAt: minutesAgo(190),
      },
      {
        id: "demo-msg-2",
        conversationId,
        senderId: "demo-juan",
        body: "Yes! Same set as last week.",
        createdAt: minutesAgo(120),
      },
      {
        id: "demo-msg-3",
        conversationId,
        senderId: "demo-maria",
        body: "Rehearsal moved to 6 PM this Saturday.",
        createdAt: minutesAgo(34),
      },
    ]
  }

  if (conversationId === "demo-direct-maria") {
    return [
      {
        id: "demo-msg-4",
        conversationId,
        senderId: "demo-maria",
        body: "Can you cover the 9 AM mass this Sunday?",
        createdAt: minutesAgo(150),
      },
      {
        id: "demo-msg-5",
        conversationId,
        senderId: DEMO_ME_ID,
        body: "Yes, I can be there.",
        createdAt: minutesAgo(140),
      },
      {
        id: "demo-msg-6",
        conversationId,
        senderId: "demo-maria",
        body: "Thank you! See you Sunday.",
        createdAt: minutesAgo(120),
      },
    ]
  }

  if (conversationId === "demo-direct-ramon") {
    return [
      {
        id: "demo-msg-7",
        conversationId,
        senderId: "demo-ramon",
        body: "Please send me the final list of volunteers.",
        createdAt: minutesAgo(1_500),
      },
    ]
  }

  return []
}

function readStore(): DemoStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as DemoStore) : {}
  } catch {
    return {}
  }
}

function writeStore(store: DemoStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // The demo still works for this render; persistence is best effort.
  }
}

export function readDemoMessages(conversationId: string): ChatMessage[] {
  const store = readStore()
  const messages = store[conversationId] ?? seedMessages(conversationId)
  store[conversationId] = messages
  writeStore(store)
  return messages
}

export function appendDemoMessage(
  conversationId: string,
  body: string,
): ChatMessage {
  const messages = readDemoMessages(conversationId)
  const message: ChatMessage = {
    id: `demo-msg-${Date.now().toString(36)}`,
    conversationId,
    senderId: DEMO_ME_ID,
    body,
    createdAt: new Date().toISOString(),
  }
  const next = [...messages, message]
  const store = readStore()
  store[conversationId] = next
  writeStore(store)
  return message
}

export function readDemoConversations(): ChatConversation[] {
  return BASE_CONVERSATIONS.map(conversation => {
    const messages = readDemoMessages(conversation.id)
    const last = messages[messages.length - 1]
    return {
      ...conversation,
      lastMessage: last?.body ?? conversation.lastMessage,
      lastMessageAt: last?.createdAt ?? conversation.lastMessageAt,
    }
  }).sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
}

export function searchDemoPeople(query: string): ChatPerson[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  return DEMO_PEOPLE.filter(person =>
    person.fullName.toLowerCase().includes(needle),
  )
}

export function startDemoConversation(otherUserId: string): string {
  const existing = DEMO_DIRECT_IDS[otherUserId]
  if (existing) return existing
  // A person without a seeded conversation still gets one, so the demo search
  // never ends in a dead end.
  const id = `demo-direct-${otherUserId}`
  DEMO_DIRECT_IDS[otherUserId] = id
  const person = DEMO_PEOPLE.find(item => item.userId === otherUserId)
  BASE_CONVERSATIONS.push({
    id,
    kind: "direct",
    title: person?.fullName ?? "Member",
    organizationId: null,
    otherUserId,
    otherUserName: person?.fullName ?? "Member",
    otherUserEmail: person?.maskedEmail ?? null,
    lastMessage: "",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    memberCount: 2,
  })
  return id
}

export function demoParticipants(conversationId: string): ChatParticipant[] {
  const me: ChatParticipant = {
    userId: DEMO_ME_ID,
    fullName: "You",
    maskedEmail: "y***@example.org",
    isSelf: true,
  }

  if (conversationId === DEMO_GROUP_ID) {
    return [
      me,
      ...DEMO_PEOPLE.filter(person => person.userId !== "demo-ramon").map(
        person => ({
          userId: person.userId,
          fullName: person.fullName,
          maskedEmail: person.maskedEmail,
          isSelf: false,
        }),
      ),
    ]
  }

  const person = DEMO_PEOPLE.find(
    item => DEMO_DIRECT_IDS[item.userId] === conversationId,
  )
  return person
    ? [
        me,
        {
          userId: person.userId,
          fullName: person.fullName,
          maskedEmail: person.maskedEmail,
          isSelf: false,
        },
      ]
    : [me]
}
