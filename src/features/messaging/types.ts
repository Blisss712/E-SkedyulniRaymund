/** A conversation is either a private chat between two accounts or an
 *  organization's automatic group chat. */
export type ConversationKind = "direct" | "organization"

/** Who the account is inside the chat's context. */
export type ChatRole = "admin" | "leader" | "member"

/** Open discussion, or announcements only (leaders/admins keep posting). */
export type ChatPostingMode = "everyone" | "leaders"

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
  /** Administrator, coordinator of this ministry, or regular member. */
  role: ChatRole
  /** The member's individual mute switch (leaders/admins always post). */
  canPost: boolean
  joinedAt: string
  /** Ministries both the viewer and this account belong to. */
  sharedOrganizations: string[]
}

/** Group posting policy and the viewer's control/post permissions. */
export type ChatSettings = {
  conversationId: string
  kind: ConversationKind
  organizationId: string | null
  postingMode: ChatPostingMode
  /** True for an administrator or the ministry's coordinator. */
  canManage: boolean
  /** Whether the signed-in account can send a message right now. */
  canPost: boolean
}

/** An account returned by the "find someone to message" search. */
export type ChatPerson = {
  userId: string
  fullName: string
  maskedEmail: string
  /** A ministry both accounts belong to, when there is one. */
  sharedOrganization: string
}
