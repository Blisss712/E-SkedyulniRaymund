/** A conversation is either a private chat between two accounts or an
 *  organization's automatic group chat. */
export type ConversationKind = "direct" | "organization"

export type ChatConversation = {
  id: string
  kind: ConversationKind
  /** The other account's name for a direct chat, or the organization name. */
  title: string
  organizationId: string | null
  /** Set for direct chats only. */
  otherUserId: string | null
  otherUserName: string | null
  /** Masked email of the other account, when the account has an email. */
  otherUserEmail: string | null
  lastMessage: string
  lastMessageAt: string | null
  unreadCount: number
  memberCount: number
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

export type ChatParticipant = {
  userId: string
  fullName: string
  maskedEmail: string
  isSelf: boolean
}

/** An account returned by the "find someone to message" search. */
export type ChatPerson = {
  userId: string
  fullName: string
  maskedEmail: string
  /** A ministry both accounts belong to, when there is one. */
  sharedOrganization: string
}
