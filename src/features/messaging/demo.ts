import type {
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  ChatPerson,
  ChatPostingMode,
  ChatRole,
  ChatSettings,
} from "./types"

/**
 * The offline demo used when no Supabase project is configured. It exists so the
 * Messages tab can be explored in the Figma Make preview; a configured project
 * always reads and writes the real tables (`supabase/messaging.sql`).
 */

export const DEMO_ME_ID = "demo-me"

const DEMO_ROLES: Record<string, ChatRole> = {
  [DEMO_ME_ID]: "leader",
  "demo-maria": "leader",
  "demo-juan": "member",
  "demo-ana": "member",
  "demo-ramon": "admin",
}

const DEMO_SHARED_ORGANIZATIONS: Record<string, string[]> = {
  [DEMO_ME_ID]: ["Parish Music Ministry"],
  "demo-maria": ["Parish Music Ministry"],
  "demo-juan": [],
  "demo-ana": ["Youth Ministry"],
  "demo-ramon": [],
}

const DEMO_JOINED_AT: Record<string, string> = {
  [DEMO_ME_ID]: minutesAgo(500),
  "demo-maria": minutesAgo(900),
  "demo-juan": minutesAgo(850),
  "demo-ana": minutesAgo(700),
  "demo-ramon": minutesAgo(600),
}

let demoPostingMode: ChatPostingMode = "everyone"
const demoMuted = new Set<string>()

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
    lastMessage: "Please keep the rehearsal focused; we have limited time.",
    lastMessageAt: minutesAgo(20),
    unreadCount: 2,
    memberCount: 5,
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
      {
        id: "demo-msg-8",
        conversationId,
        senderId: "demo-ramon",
        body: "Please keep the rehearsal focused; we have limited time.",
        createdAt: minutesAgo(20),
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

function demoParticipant(
  userId: string,
  fullName: string,
  maskedEmail: string,
  isSelf: boolean,
): ChatParticipant {
  const role = DEMO_ROLES[userId] ?? "member"
  return {
    userId,
    fullName,
    maskedEmail,
    isSelf,
    role,
    // Leaders and administrators always keep posting access.
    canPost: role === "member" ? !demoMuted.has(userId) : true,
    joinedAt: DEMO_JOINED_AT[userId] ?? minutesAgo(500),
    sharedOrganizations: DEMO_SHARED_ORGANIZATIONS[userId] ?? [],
  }
}

export function demoParticipants(conversationId: string): ChatParticipant[] {
  const me = demoParticipant(
    DEMO_ME_ID,
    "You",
    "y***@example.org",
    true,
  )

  if (conversationId === DEMO_GROUP_ID) {
    return [
      me,
      ...DEMO_PEOPLE.map(person =>
        demoParticipant(
          person.userId,
          person.fullName,
          person.maskedEmail,
          false,
        ),
      ),
    ]
  }

  const person = DEMO_PEOPLE.find(
    item => DEMO_DIRECT_IDS[item.userId] === conversationId,
  )
  return person
    ? [
        me,
        demoParticipant(
          person.userId,
          person.fullName,
          person.maskedEmail,
          false,
        ),
      ]
    : [me]
}

export function demoConversationSettings(
  conversationId: string,
): ChatSettings {
  const conversation = BASE_CONVERSATIONS.find(item => item.id === conversationId)
  const group = conversation?.kind === "organization"

  return {
    conversationId,
    kind: group ? "organization" : "direct",
    organizationId: conversation?.organizationId ?? null,
    postingMode: group ? demoPostingMode : "everyone",
    // The demo's signed-in account is the music ministry's coordinator.
    canManage: group,
    canPost: true,
  }
}

export function updateDemoPostingMode(
  conversationId: string,
  mode: ChatPostingMode,
) {
  if (conversationId === DEMO_GROUP_ID) demoPostingMode = mode
}

export function setDemoCanPost(userId: string, canPost: boolean) {
  if (canPost) demoMuted.delete(userId)
  else demoMuted.add(userId)
}
