import { isSupabaseConfigured, supabase } from "../../lib/supabase"
import {
  appendDemoMessage,
  demoConversationSettings,
  demoParticipants,
  markDemoConversationRead,
  readDemoConversations,
  readDemoMessages,
  searchDemoPeople,
  setDemoCanPost,
  startDemoConversation,
  updateDemoPostingMode,
} from "./demo"
import type {
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  ChatPerson,
  ChatPostingMode,
  ChatRole,
  ChatSettings,
  ConversationKind,
} from "./types"

/**
 * Messaging data access.
 *
 * The tables, policies, and RPCs live in `supabase/messaging.sql`:
 *   chat_conversations / chat_participants / chat_messages
 *   search_member_accounts()      find another account by name or email
 *   start_direct_conversation()   open (or reuse) the private chat with them
 *   list_my_conversations()       the inbox, with previews and unread counts
 *   get_conversation_participants() people, roles, profiles, and mute state
 *   get_conversation_settings()   posting mode + the viewer's permissions
 *   update_chat_group_settings()  announcements-only / open discussion
 *   set_chat_member_can_post()    mute or unmute one member
 *   mark_conversation_read()      clear this account's unread badge
 *
 * A project without a configured Supabase client falls back to the local demo
 * data in `demo.ts` so the screens can still be explored.
 */

type ConversationRow = {
  conversation_id: string
  kind: string
  title: string | null
  organization_id: string | null
  other_user_id: string | null
  other_user_name: string | null
  other_user_masked_email: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number | null
  member_count: number | null
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

type PersonRow = {
  user_id: string
  full_name: string | null
  masked_email: string | null
  shared_organization: string | null
}

type ParticipantRow = {
  user_id: string
  full_name: string | null
  masked_email: string | null
  is_self: boolean
  role?: string | null
  can_post?: boolean | null
  joined_at?: string | null
  shared_organizations?: string[] | null
}

type SettingsRow = {
  conversation_id: string
  kind: string
  organization_id: string | null
  posting_mode: string | null
  can_manage: boolean | null
  can_post: boolean | null
}

function fromSupabase(
  error: { message?: string; code?: string } | null,
  fallback: string,
): Error {
  const message = error?.message?.trim() || fallback

  // These are returned until supabase/messaging.sql has been run. Say what to
  // do instead of showing a raw PostgREST code.
  if (
    /could not find the function|function .* does not exist|schema cache/i.test(message) ||
    /relation .* does not exist/i.test(message)
  ) {
    return new Error(
      "Messaging is not set up in Supabase yet. Run supabase/messaging.sql in the Supabase SQL editor, then reload the app.",
    )
  }

  if (/permission denied|row-level security/i.test(message)) {
    return new Error(
      "Messaging could not be opened for this account. Run supabase/messaging.sql to install the messaging policies.",
    )
  }

  return new Error(message)
}

function conversationKind(value: string | null): ConversationKind {
  return value === "organization" ? "organization" : "direct"
}

function conversationFromRow(row: ConversationRow): ChatConversation {
  return {
    id: row.conversation_id,
    kind: conversationKind(row.kind),
    title: row.title?.trim() || "Conversation",
    organizationId: row.organization_id,
    otherUserId: row.other_user_id,
    otherUserName: row.other_user_name,
    otherUserEmail: row.other_user_masked_email,
    lastMessage: row.last_message ?? "",
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count ?? 0,
    memberCount: row.member_count ?? 0,
  }
}

function messageFromRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  }
}

function personFromRow(row: PersonRow): ChatPerson {
  return {
    userId: row.user_id,
    fullName: row.full_name?.trim() || "Member",
    maskedEmail: row.masked_email ?? "",
    sharedOrganization: row.shared_organization ?? "",
  }
}

function roleFromValue(value: string | null | undefined): ChatRole {
  return value === "admin" || value === "leader" ? value : "member"
}

function postingModeFromValue(
  value: string | null | undefined,
): ChatPostingMode {
  return value === "leaders" ? "leaders" : "everyone"
}

function participantFromRow(row: ParticipantRow): ChatParticipant {
  return {
    userId: row.user_id,
    fullName: row.full_name?.trim() || "Member",
    maskedEmail: row.masked_email ?? "",
    isSelf: row.is_self,
    role: roleFromValue(row.role),
    // Projects on the earlier messaging schema do not return can_post; treat
    // those participants as able to post until the updated SQL is installed.
    canPost: row.can_post !== false,
    joinedAt: row.joined_at ?? "",
    sharedOrganizations: row.shared_organizations ?? [],
  }
}

/** Realtime payload rows arrive as plain objects. */
function messageFromPayload(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null
  const row = value as Partial<MessageRow>
  if (
    typeof row.id !== "string" ||
    typeof row.conversation_id !== "string" ||
    typeof row.sender_id !== "string" ||
    typeof row.body !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null
  }
  return messageFromRow(row as MessageRow)
}

// ─── Account search ──────────────────────────────────────────────────────────

/** Finds other member accounts by full name or email address. */
export async function searchChatAccounts(query: string): Promise<ChatPerson[]> {
  const clean = query.trim()
  if (clean.length < 2) return []

  if (!isSupabaseConfigured) return searchDemoPeople(clean)

  const { data, error } = await supabase.rpc("search_member_accounts", {
    p_query: clean,
  })
  if (error) throw fromSupabase(error, "Unable to search accounts.")
  return ((data ?? []) as PersonRow[]).map(personFromRow)
}

// ─── Conversations ───────────────────────────────────────────────────────────

/** Every chat the signed-in account belongs to, newest activity first. */
export async function fetchConversations(): Promise<ChatConversation[]> {
  if (!isSupabaseConfigured) return readDemoConversations()

  const { data, error } = await supabase.rpc("list_my_conversations")
  if (error) throw fromSupabase(error, "Unable to load your messages.")
  return ((data ?? []) as ConversationRow[]).map(conversationFromRow)
}

/** Opens the private chat with another account, creating it when needed. */
export async function startDirectConversation(
  otherUserId: string,
): Promise<string> {
  if (!isSupabaseConfigured) return startDemoConversation(otherUserId)

  const { data, error } = await supabase.rpc("start_direct_conversation", {
    p_other_user_id: otherUserId,
  })
  if (error) throw fromSupabase(error, "Unable to start that conversation.")
  return data as string
}

export async function fetchParticipants(
  conversationId: string,
): Promise<ChatParticipant[]> {
  if (!isSupabaseConfigured) return demoParticipants(conversationId)

  const { data, error } = await supabase.rpc("get_conversation_participants", {
    p_conversation_id: conversationId,
  })
  if (error) throw fromSupabase(error, "Unable to load the conversation members.")
  return ((data ?? []) as ParticipantRow[]).map(participantFromRow)
}

/** Group posting policy plus the signed-in account's control/post rights. */
export async function fetchConversationSettings(
  conversationId: string,
): Promise<ChatSettings> {
  if (!isSupabaseConfigured) {
    return demoConversationSettings(conversationId)
  }

  const { data, error } = await supabase.rpc("get_conversation_settings", {
    p_conversation_id: conversationId,
  })
  if (error) throw fromSupabase(error, "Unable to load the chat settings.")
  const row = ((data ?? []) as SettingsRow[])[0]
  if (!row) throw new Error("That conversation is not available to this account.")

  return {
    conversationId: row.conversation_id,
    kind: conversationKind(row.kind),
    organizationId: row.organization_id,
    postingMode: postingModeFromValue(row.posting_mode),
    canManage: row.can_manage === true,
    canPost: row.can_post === true,
  }
}

/** Switches a ministry group between open discussion and announcements only. */
export async function updateChatPostingMode(
  conversationId: string,
  postingMode: ChatPostingMode,
): Promise<void> {
  if (!isSupabaseConfigured) {
    updateDemoPostingMode(conversationId, postingMode)
    return
  }

  const { error } = await supabase.rpc("update_chat_group_settings", {
    p_conversation_id: conversationId,
    p_posting_mode: postingMode,
  })
  if (error) throw fromSupabase(error, "Unable to update the group settings.")
}

/** Mutes or unmutes one regular member in a ministry group. */
export async function setChatMemberCanPost(
  conversationId: string,
  userId: string,
  canPost: boolean,
): Promise<void> {
  if (!isSupabaseConfigured) {
    setDemoCanPost(userId, canPost)
    return
  }

  const { error } = await supabase.rpc("set_chat_member_can_post", {
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_can_post: canPost,
  })
  if (error) throw fromSupabase(error, "Unable to change this member's access.")
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function fetchMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured) return readDemoMessages(conversationId)

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    // Read the newest page, then reverse it for the oldest-to-newest transcript.
    .order("created_at", { ascending: false })
    .limit(300)

  if (error) throw fromSupabase(error, "Unable to load this conversation.")
  return ((data ?? []) as MessageRow[]).reverse().map(messageFromRow)
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  const clean = body.trim().slice(0, 4000)
  if (!clean) throw new Error("Type a message first.")

  if (!isSupabaseConfigured) return appendDemoMessage(conversationId, clean)

  const { data: sessionData } = await supabase.auth.getSession()
  const senderId = sessionData.session?.user.id
  if (!senderId) throw new Error("Sign in to send a message.")

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: clean,
    })
    .select("id, conversation_id, sender_id, body, created_at")
    .single()

  if (error) throw fromSupabase(error, "Unable to send that message.")
  return messageFromRow(data as MessageRow)
}

/** Clears the unread badge by moving this account's read marker to now. */
export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    markDemoConversationRead(conversationId)
    return
  }

  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  })
  if (error) {
    // A failed read marker must not break the chat screen.
    console.warn("Unable to mark the conversation as read:", error.message)
  }
}

// ─── Realtime ────────────────────────────────────────────────────────────────

/** Streams new messages of one open conversation. */
export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
): () => void {
  if (!isSupabaseConfigured) return () => {}

  const channel = supabase
    .channel(`chat-messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      payload => {
        const message = messageFromPayload(payload.new)
        if (message) onMessage(message)
      },
    )
    .subscribe(status => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Unable to subscribe to messages in this conversation.")
      }
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * Refreshes the inbox when a message arrives anywhere the account can read, or
 * when the account is added to a new group chat.
 */
export function subscribeToInbox(
  userId: string,
  onChange: () => void,
): () => void {
  if (!isSupabaseConfigured) return () => {}

  let timer = 0
  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(onChange, 400)
  }

  const channel = supabase
    .channel(`chat-inbox:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      schedule,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_participants",
        filter: `user_id=eq.${userId}`,
      },
      schedule,
    )
    .subscribe(status => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Unable to subscribe to inbox updates.")
      }
    })

  return () => {
    window.clearTimeout(timer)
    void supabase.removeChannel(channel)
  }
}
