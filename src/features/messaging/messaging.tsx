import { useEffect, useMemo, useRef, useState } from "react"
import { Button, InputField } from "../../shared/ui"
import { isSupabaseConfigured } from "../../lib/supabase"
import { useAuth } from "../auth/AuthContext"
import {
  fetchConversations,
  fetchMessages,
  fetchParticipants,
  markConversationRead,
  searchChatAccounts,
  sendMessage,
  startDirectConversation,
  subscribeToMessages,
} from "./api"
import { DEMO_ME_ID } from "./demo"
import { useMessaging } from "./MessagingContext"
import type {
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  ChatPerson,
} from "./types"

// ─── Small presentation helpers ─────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-[#1B3A6B]",
  "bg-[#2D7A4F]",
  "bg-[#C9921A]",
  "bg-[#7A4E9E]",
  "bg-[#B5533C]",
  "bg-[#2A6F8E]",
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : ""
  return `${first}${last}`.toUpperCase()
}

function avatarColor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function Avatar({
  name,
  seed,
  group = false,
  size = "md",
  className = "",
}: {
  name: string
  seed: string
  group?: boolean
  size?: "sm" | "md"
  className?: string
}) {
  const dimensions = size === "sm" ? "h-9 w-9 text-[12px]" : "h-12 w-12 text-[15px]"
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${dimensions} ${avatarColor(seed)} ${className}`}
      aria-hidden="true"
    >
      {group ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={size === "sm" ? "h-5 w-5" : "h-6 w-6"}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 6 17.5V19"
          />
          <circle cx="10.5" cy="8" r="3" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.2a3 3 0 0 1 0 5.6"
          />
        </svg>
      ) : (
        initials(name)
      )}
    </span>
  )
}

function formatListTime(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return "Yesterday"

  const elapsedDays = (now.getTime() - date.getTime()) / 86_400_000
  if (elapsedDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" })
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

// ─── Inbox + account search ─────────────────────────────────────────────────

export function MessagesPanel({
  conversations,
  loading,
  error,
  onOpen,
  variant = "member",
}: {
  conversations: ChatConversation[]
  loading: boolean
  error: string
  onOpen: (conversation: ChatConversation) => void
  /** The admin workspace uses slightly different framing copy. */
  variant?: "member" | "admin"
}) {
  const { user } = useAuth()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ChatPerson[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState("")
  const [startingId, setStartingId] = useState("")
  const [startError, setStartError] = useState("")

  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length >= 2

  // Search accounts shortly after the member stops typing.
  useEffect(() => {
    if (!hasQuery) {
      setResults([])
      setSearching(false)
      setSearchError("")
      return
    }

    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchChatAccounts(trimmedQuery)
        .then(people => {
          if (!active) return
          setResults(people)
          setSearchError("")
        })
        .catch(reason => {
          if (!active) return
          setResults([])
          setSearchError(
            reason instanceof Error
              ? reason.message
              : "Unable to search accounts right now.",
          )
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 280)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [hasQuery, trimmedQuery])

  async function start(person: ChatPerson) {
    setStartingId(person.userId)
    setStartError("")

    try {
      const conversationId = await startDirectConversation(person.userId)
      // Reading the inbox back gives the conversation its real preview and
      // member count, including messages that already exist.
      const list = await fetchConversations().catch(() => [])
      const saved = list.find(item => item.id === conversationId)
      const conversation: ChatConversation = saved ?? {
        id: conversationId,
        kind: "direct",
        title: person.fullName,
        organizationId: null,
        otherUserId: person.userId,
        otherUserName: person.fullName,
        otherUserEmail: person.maskedEmail,
        lastMessage: "",
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        memberCount: 2,
      }
      setQuery("")
      setResults([])
      onOpen(conversation)
    } catch (reason) {
      setStartError(
        reason instanceof Error
          ? reason.message
          : "Unable to start that conversation.",
      )
    } finally {
      setStartingId("")
    }
  }

  const empty = conversations.length === 0

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#C9921A]">
          {variant === "admin" ? "Communication" : "Community"}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#1B3A6B]">
          Messages
        </h2>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[#64748B]">
          {variant === "admin"
            ? "Message a member privately, or use the group chat of every ministry you are assigned to."
            : "Send a private message to another account, or catch up with the group chat of every ministry you belong to."}
        </p>
      </div>

      <div className="rounded-2xl border border-[#D1D9E8] bg-white p-4 shadow-sm sm:p-5">
        {isSupabaseConfigured && !user && (
          <p className="mb-4 rounded-xl bg-[#FEF3DC] p-3 text-sm leading-relaxed text-[#8A6410]">
            Messaging uses your Supabase account session. Sign in through the
            member, coordinator, or Supabase administrator form to send
            messages; an administrator signed in only through the optional
            FastAPI backend has no chat identity.
          </p>
        )}
        <InputField
          id="message-account-search"
          label="Find someone to message"
          value={query}
          onChange={setQuery}
          placeholder="Search by full name or email"
          helper="Every account can be found by name. Email addresses stay hidden; only their first letter and domain are shown."
        />

        {hasQuery && (
          <div className="mt-4 overflow-hidden rounded-xl border border-[#D1D9E8]">
            <div className="flex items-center justify-between border-b border-[#D1D9E8] bg-[#F4F6FB] px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
                Accounts
              </p>
              {searching && (
                <p className="text-xs font-semibold text-[#64748B]">Searching…</p>
              )}
            </div>

            {searchError ? (
              <p role="alert" className="px-4 py-4 text-sm text-[#C0392B]">
                {searchError}
              </p>
            ) : results.length ? (
              <div className="divide-y divide-[#EEF1F6]">
                {results.map(person => (
                  <div
                    key={person.userId}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Avatar
                      name={person.fullName}
                      seed={person.userId}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[#1A202C]">
                        {person.fullName}
                      </p>
                      <p className="truncate text-xs text-[#64748B]">
                        {person.sharedOrganization || "Member account"}
                      </p>
                      {person.maskedEmail && (
                        <p className="truncate text-[11px] text-[#94A3B8]">
                          {person.maskedEmail}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="compact"
                      fullWidth={false}
                      disabled={startingId === person.userId}
                      onClick={() => void start(person)}
                    >
                      {startingId === person.userId ? "Opening…" : "Message"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : searching ? (
              <div className="space-y-3 px-4 py-4">
                {[0, 1].map(row => (
                  <div key={row} className="flex items-center gap-3">
                    <span className="h-9 w-9 animate-pulse rounded-full bg-[#E8EDF7]" />
                    <span className="h-3 w-40 animate-pulse rounded bg-[#E8EDF7]" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-[#64748B]">
                No account matches “{trimmedQuery}”. Try the full name or the
                account email.
              </p>
            )}
          </div>
        )}

        {startError && (
          <p role="alert" className="mt-3 text-sm font-semibold text-[#C0392B]">
            {startError}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#C0392B]/30 bg-[#FDEDEC] px-4 py-3 text-sm text-[#C0392B]"
        >
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#D1D9E8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#D1D9E8] px-4 py-3">
          <p className="text-sm font-bold text-[#1A202C]">Conversations</p>
          <p className="text-xs font-semibold text-[#64748B]">
            {conversations.length}
          </p>
        </div>

        {loading && empty ? (
          <div className="space-y-4 px-4 py-5">
            {[0, 1, 2].map(row => (
              <div key={row} className="flex items-center gap-3">
                <span className="h-12 w-12 animate-pulse rounded-full bg-[#E8EDF7]" />
                <div className="flex-1 space-y-2">
                  <span className="block h-3 w-32 animate-pulse rounded bg-[#E8EDF7]" />
                  <span className="block h-3 w-48 animate-pulse rounded bg-[#E8EDF7]" />
                </div>
              </div>
            ))}
          </div>
        ) : empty ? (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8EDF7] text-[#1B3A6B]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 18.5 4 21l.9-4.1A8 8 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.6 0-3.1-.5-4.5-1.5Z"
                />
              </svg>
            </span>
            <p className="text-lg font-bold text-[#1A202C]">
              No conversations yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[#64748B]">
              Search for an account above to start a private chat. A group chat
              is created automatically for every ministry you join.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EEF1F6]">
            {conversations.map(conversation => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onOpen(conversation)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F8FAFD] ${
                  conversation.unreadCount > 0 ? "bg-[#FAFBFF]" : ""
                }`}
              >
                <Avatar
                  name={conversation.title}
                  seed={conversation.organizationId ?? conversation.otherUserId ?? conversation.id}
                  group={conversation.kind === "organization"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-bold text-[#1A202C]">
                      {conversation.title}
                    </p>
                    <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
                      {formatListTime(conversation.lastMessageAt)}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 truncate text-[13px] ${
                      conversation.unreadCount > 0
                        ? "font-semibold text-[#1A202C]"
                        : "text-[#64748B]"
                    }`}
                  >
                    {conversation.lastMessage ||
                      (conversation.kind === "organization"
                        ? "No messages yet — say hello to the group."
                        : "No messages yet — say hello.")}
                  </p>
                  {conversation.kind === "organization" && (
                    <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
                      Ministry group · {conversation.memberCount} member
                      {conversation.memberCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
                {conversation.unreadCount > 0 && (
                  <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#C0392B] px-1.5 text-[11px] font-extrabold text-white">
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs leading-relaxed text-[#94A3B8]">
        Private chats are visible only to the two accounts in them. Ministry
        group chats include every approved member and assigned administrator of
        that ministry.
      </p>
    </div>
  )
}

// ─── One open conversation ──────────────────────────────────────────────────

export function ChatScreen({
  conversation,
  onBack,
}: {
  conversation: ChatConversation
  onBack: () => void
}) {
  const { user, profile } = useAuth()
  const { refresh } = useMessaging()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [participants, setParticipants] = useState<ChatParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const myId = user?.id ?? (isSupabaseConfigured ? "" : DEMO_ME_ID)
  const isGroup = conversation.kind === "organization"

  const participantNames = useMemo(() => {
    const names = new Map<string, string>()
    participants.forEach(participant => {
      names.set(participant.userId, participant.fullName)
    })
    return names
  }, [participants])

  const senderName = (senderId: string) => {
    if (senderId === myId) return profile?.fullName ?? "You"
    return participantNames.get(senderId) ?? "Member"
  }

  function readNow() {
    void markConversationRead(conversation.id).then(() => {
      void refresh()
    })
  }

  // Load the history and members.
  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")

    Promise.all([
      fetchMessages(conversation.id),
      fetchParticipants(conversation.id),
    ])
      .then(([savedMessages, people]) => {
        if (!active) return
        setMessages(savedMessages)
        setParticipants(people)
        setLoading(false)
        readNow()
      })
      .catch(reason => {
        if (!active) return
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to open this conversation.",
        )
        setLoading(false)
      })

    return () => {
      active = false
    }
    // readNow is deliberately not a dependency: it only writes the read marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id])

  // Receive new messages while the conversation is open.
  useEffect(() => {
    return subscribeToMessages(conversation.id, message => {
      setMessages(current =>
        current.some(item => item.id === message.id)
          ? current
          : [...current, message],
      )
      if (message.senderId !== myId) readNow()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, myId])

  // Realtime is the fast path; this pull keeps the conversation current when
  // Realtime is unavailable, merging instead of replacing so a message that is
  // being sent is never dropped by a slightly older response.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchMessages(conversation.id)
        .then(saved => {
          const known = new Set(messagesRef.current.map(item => item.id))
          const hasNewMessage = saved.some(
            item => !known.has(item.id) && item.senderId !== myId,
          )
          setMessages(current => {
            if (saved.length === 0 && current.length > 0) return current
            const merged = new Map(current.map(item => [item.id, item]))
            saved.forEach(item => merged.set(item.id, item))
            return [...merged.values()].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            )
          })
          if (hasNewMessage) readNow()
        })
        .catch(() => undefined)
    }, 20_000)

    return () => window.clearInterval(timer)
  }, [conversation.id])

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, loading])

  async function submit() {
    const clean = draft.trim()
    if (!clean || sending) return

    setSending(true)
    setError("")
    try {
      const saved = await sendMessage(conversation.id, clean)
      setMessages(current =>
        current.some(item => item.id === saved.id)
          ? current
          : [...current, saved],
      )
      setDraft("")
      readNow()
      inputRef.current?.focus()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to send that message.",
      )
    } finally {
      setSending(false)
    }
  }

  const subtitle = isGroup
    ? `Ministry group · ${conversation.memberCount} member${
        conversation.memberCount === 1 ? "" : "s"
      }`
    : conversation.otherUserEmail
      ? `Private conversation · ${conversation.otherUserEmail}`
      : "Private conversation"

  return (
    <div className="flex h-dvh flex-col bg-[#F4F6FB]">
      <header
        className="z-30 shrink-0 border-b border-white/10 bg-[#1B3A6B] text-white"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-3 pb-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to messages"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 text-white transition-colors hover:bg-white/10"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.5 5.5-6 6.5 6 6.5"
              />
            </svg>
          </button>
          <Avatar
            name={conversation.title}
            seed={
              conversation.organizationId ??
              conversation.otherUserId ??
              conversation.id
            }
            group={isGroup}
            size="sm"
            className="ring-2 ring-white/30"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-extrabold">
              {conversation.title}
            </p>
            <p className="truncate text-[11px] text-white/65">{subtitle}</p>
          </div>
          {isGroup && (
            <span className="hidden shrink-0 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white sm:inline-flex">
              Group
            </span>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-4 py-5">
          {isGroup && (
            <p className="mx-auto mb-1 max-w-md rounded-xl bg-[#E8EDF7] px-3 py-2 text-center text-[11px] leading-relaxed text-[#64748B]">
              Everyone in {conversation.title} can read this group chat.
              Approved members and assigned administrators are added
              automatically.
            </p>
          )}

          {loading ? (
            <div className="space-y-3 py-4">
              {[0, 1, 2].map(row => (
                <div
                  key={row}
                  className={`flex ${row === 1 ? "justify-end" : "justify-start"}`}
                >
                  <span className="h-14 w-2/3 max-w-xs animate-pulse rounded-2xl bg-[#E8EDF7]" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8EDF7] text-[#1B3A6B]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-7 w-7"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 18.5 4 21l.9-4.1A8 8 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.6 0-3.1-.5-4.5-1.5Z"
                  />
                </svg>
              </span>
              <p className="text-lg font-bold text-[#1A202C]">
                {isGroup ? "Start the ministry conversation" : "Say hello"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-[#64748B]">
                {isGroup
                  ? "No one has posted here yet. Share the first update with the group."
                  : `This is the beginning of your private conversation with ${conversation.otherUserName ?? conversation.title}.`}
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const mine = message.senderId === myId
              const previous = messages[index - 1]
              const showSender = isGroup && !mine && previous?.senderId !== message.senderId

              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm sm:max-w-[75%] ${
                      mine
                        ? "rounded-br-md bg-[#1B3A6B] text-white"
                        : "rounded-bl-md border border-[#D1D9E8] bg-white text-[#1A202C]"
                    }`}
                  >
                    {showSender && (
                      <p className="mb-1 text-[11px] font-extrabold text-[#C9921A]">
                        {senderName(message.senderId)}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                      {message.body}
                    </p>
                    <p
                      className={`mt-1 text-right text-[10px] ${
                        mine ? "text-white/60" : "text-[#94A3B8]"
                      }`}
                    >
                      {formatMessageTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div
        className="shrink-0 border-t border-[#D1D9E8] bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-3">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-lg bg-[#FDEDEC] px-3 py-2 text-xs font-semibold text-[#C0392B]"
            >
              {error}
            </p>
          )}
          <form
            onSubmit={event => {
              event.preventDefault()
              void submit()
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="message-draft" className="sr-only">
              Message
            </label>
            <textarea
              id="message-draft"
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={4000}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  void submit()
                }
              }}
              placeholder={isGroup ? "Message the group" : "Write a message"}
              className="max-h-32 min-h-12 w-full resize-none rounded-xl border-2 border-[#D1D9E8] bg-white px-4 py-3 text-[15px] leading-snug text-[#1A202C] placeholder-[#94A3B8] transition-colors focus:border-[#1B3A6B] focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/20"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1B3A6B] text-white transition-colors hover:bg-[#142d54] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {sending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12 15-7-4 15-3.5-6.5L4.5 12Z"
                  />
                </svg>
              )}
            </button>
          </form>
          <p className="mt-1.5 px-1 text-[10px] text-[#94A3B8]">
            Enter sends · Shift + Enter adds a line
          </p>
        </div>
      </div>
    </div>
  )
}
