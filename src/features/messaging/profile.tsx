import { Button } from "../../shared/ui"
import type {
  ChatConversation,
  ChatParticipant,
  ChatPostingMode,
  ChatRole,
  ChatSettings,
} from "./types"

// ─── Shared profile pieces ──────────────────────────────────────────────────

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

export function roleRingClass(role?: ChatRole) {
  if (role === "leader") return "ring-2 ring-[#C9921A]"
  if (role === "admin") return "ring-2 ring-[#1B3A6B]"
  return ""
}

export function Avatar({
  name,
  seed,
  group = false,
  size = "md",
  className = "",
}: {
  name: string
  seed: string
  group?: boolean
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}) {
  const dimensions =
    size === "xs"
      ? "h-7 w-7 text-[9px]"
      : size === "sm"
        ? "h-9 w-9 text-[12px]"
        : size === "lg"
          ? "h-20 w-20 text-2xl"
          : "h-12 w-12 text-[15px]"

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
          className={size === "lg" ? "h-10 w-10" : size === "xs" ? "h-4 w-4" : "h-6 w-6"}
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

export function RoleBadge({
  role,
  compact = false,
  showMember = false,
}: {
  role: ChatRole
  compact?: boolean
  showMember?: boolean
}) {
  if (role === "member" && !showMember) return null

  const styles: Record<ChatRole, string> = {
    admin: "bg-[#E8EDF7] text-[#1B3A6B]",
    leader: "bg-[#FEF3DC] text-[#8A6410]",
    member: "bg-[#F4F6FB] text-[#64748B]",
  }
  const labels: Record<ChatRole, string> = {
    admin: "Admin",
    leader: "Coordinator",
    member: "Member",
  }

  return (
    <span
      title={
        role === "admin"
          ? "Parish administrator"
          : role === "leader"
            ? "Ministry coordinator"
            : "Ministry member"
      }
      className={`inline-flex shrink-0 items-center rounded-full font-extrabold uppercase tracking-wide ${styles[role]} ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      }`}
    >
      {labels[role]}
    </span>
  )
}

function roleDescription(role: ChatRole) {
  if (role === "admin") return "Parish administrator"
  if (role === "leader") return "Ministry coordinator"
  return "Ministry member"
}

function formatJoinedDate(value: string) {
  if (!value) return "Recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Sheet shell ─────────────────────────────────────────────────────────────

function Sheet({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-[#1A202C] shadow-2xl sm:rounded-3xl">
        {children}
      </div>
    </div>
  )
}

function SheetHeader({
  eyebrow,
  title,
  detail,
  left,
  onClose,
}: {
  eyebrow: string
  title: string
  detail?: string
  left?: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#D1D9E8] px-5 py-4">
      <div className="flex min-w-0 items-start gap-2">
        {left}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#C9921A]">
            {eyebrow}
          </p>
          <p className="truncate text-lg font-extrabold text-[#1B3A6B]">
            {title}
          </p>
          {detail && (
            <p className="truncate text-xs text-[#64748B]">{detail}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-[#64748B] transition-colors hover:bg-[#F4F6FB] hover:text-[#1B3A6B]"
      >
        Close
      </button>
    </div>
  )
}

// ─── Member list ────────────────────────────────────────────────────────────

function GroupControls({
  settings,
  busy,
  onSetPostingMode,
}: {
  settings: ChatSettings
  busy: boolean
  onSetPostingMode: (mode: ChatPostingMode) => void
}) {
  const everyone = settings.postingMode === "everyone"

  return (
    <div className="rounded-2xl border border-[#D1D9E8] bg-[#FCFCFE] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-[#1A202C]">Group controls</p>
          <p className="mt-0.5 text-[11px] text-[#64748B]">
            Administrators and coordinators can manage this chat.
          </p>
        </div>
        {busy && (
          <span className="shrink-0 text-[11px] font-semibold text-[#64748B]">
            Saving…
          </span>
        )}
      </div>

      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
        Who can send messages?
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-[#F4F6FB] p-1">
        {(
          [
            ["everyone", "Everyone"],
            ["leaders", "Announcements only"],
          ] as Array<[ChatPostingMode, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={settings.postingMode === value}
            disabled={busy}
            onClick={() => onSetPostingMode(value)}
            className={`min-h-10 rounded-lg px-2 text-[12px] font-bold transition-colors ${
              settings.postingMode === value
                ? "bg-white text-[#1B3A6B] shadow-sm ring-1 ring-[#1B3A6B]/15"
                : "text-[#64748B] hover:bg-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#64748B]">
        {everyone
          ? "All approved members can send messages. You can still mute individual members below."
          : "Only administrators and coordinators can send. Members can read the group but cannot post."}
      </p>
    </div>
  )
}

function GroupStatus({ settings }: { settings: ChatSettings }) {
  const message =
    settings.postingMode === "leaders"
      ? "Announcements only — only administrators and coordinators can send messages right now."
      : settings.canPost
        ? "All members can send messages in this group."
        : "Your messages are muted by a coordinator in this group."

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-[#D1D9E8] bg-[#F4F6FB] p-4">
      <span className="mt-0.5 shrink-0 text-[#1B3A6B]" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 18.5 4 21l.9-4.1A8 8 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.6 0-3.1-.5-4.5-1.5Z"
          />
        </svg>
      </span>
      <p className="text-[12px] leading-relaxed text-[#475569]">{message}</p>
    </div>
  )
}

function MemberRow({
  participant,
  settings,
  busy,
  onOpenProfile,
  onToggleCanPost,
}: {
  participant: ChatParticipant
  settings: ChatSettings
  busy: boolean
  onOpenProfile: (participant: ChatParticipant) => void
  onToggleCanPost: (participant: ChatParticipant) => void
}) {
  const announceOnly = settings.postingMode === "leaders"
  const canMute =
    settings.canManage &&
    !announceOnly &&
    participant.role === "member" &&
    !participant.isSelf

  return (
    <div className="flex items-center gap-3 border-b border-[#EEF1F6] px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpenProfile(participant)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Avatar
          name={participant.fullName}
          seed={participant.userId}
          size="sm"
          className={roleRingClass(participant.role)}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[14px] font-bold text-[#1A202C]">
              {participant.fullName}
            </span>
            {participant.isSelf && (
              <span className="rounded-full bg-[#F4F6FB] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#64748B]">
                You
              </span>
            )}
            <RoleBadge role={participant.role} showMember />
          </div>
          <p className="truncate text-[11px] text-[#94A3B8]">
            {participant.maskedEmail || "No email address"}
          </p>
        </div>
      </button>

      {participant.role !== "member" ? (
        <span className="shrink-0 rounded-full bg-[#E8F5EE] px-2 py-1 text-[10px] font-bold text-[#2D7A4F]">
          Always
        </span>
      ) : announceOnly ? (
        <span className="shrink-0 rounded-full bg-[#F4F6FB] px-2 py-1 text-[10px] font-bold text-[#64748B]">
          Read-only
        </span>
      ) : canMute ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleCanPost(participant)}
          className={`min-h-9 shrink-0 rounded-full border px-2.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
            participant.canPost
              ? "border-[#D1D9E8] bg-white text-[#64748B] hover:border-[#C0392B]/40 hover:text-[#C0392B]"
              : "border-[#2D7A4F]/30 bg-[#E8F5EE] text-[#2D7A4F] hover:bg-[#D8EEDF]"
          }`}
        >
          {participant.canPost ? "Mute" : "Allow"}
        </button>
      ) : (
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
            participant.canPost
              ? "bg-[#E8F5EE] text-[#2D7A4F]"
              : "bg-[#FDEDEC] text-[#C0392B]"
          }`}
        >
          {participant.canPost ? "Can send" : "Muted"}
        </span>
      )}
    </div>
  )
}

export function ChatMembersSheet({
  conversation,
  participants,
  settings,
  busy,
  error,
  onClose,
  onOpenProfile,
  onSetPostingMode,
  onToggleCanPost,
}: {
  conversation: ChatConversation
  participants: ChatParticipant[]
  settings: ChatSettings
  busy: boolean
  error: string
  onClose: () => void
  onOpenProfile: (participant: ChatParticipant) => void
  onSetPostingMode: (mode: ChatPostingMode) => void
  onToggleCanPost: (participant: ChatParticipant) => void
}) {
  const roleRank: Record<ChatRole, number> = { admin: 0, leader: 1, member: 2 }
  const sorted = [...participants].sort(
    (a, b) =>
      roleRank[a.role] - roleRank[b.role] ||
      a.fullName.localeCompare(b.fullName),
  )

  return (
    <Sheet label="Group members" onClose={onClose}>
      <SheetHeader
        eyebrow="Group chat"
        title={conversation.title}
        detail={`${participants.length} member${participants.length === 1 ? "" : "s"}`}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-[#FDEDEC] px-3 py-2 text-[12px] font-semibold text-[#C0392B]"
          >
            {error}
          </p>
        )}

        {settings.canManage ? (
          <GroupControls
            settings={settings}
            busy={busy}
            onSetPostingMode={onSetPostingMode}
          />
        ) : (
          <GroupStatus settings={settings} />
        )}

        <div className="overflow-hidden rounded-2xl border border-[#D1D9E8]">
          <div className="border-b border-[#D1D9E8] bg-[#F4F6FB] px-4 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Members
            </p>
          </div>
          {sorted.length ? (
            sorted.map(participant => (
              <MemberRow
                key={participant.userId}
                participant={participant}
                settings={settings}
                busy={busy}
                onOpenProfile={onOpenProfile}
                onToggleCanPost={onToggleCanPost}
              />
            ))
          ) : (
            <p className="px-4 py-6 text-center text-sm text-[#64748B]">
              No members to show.
            </p>
          )}
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-[#94A3B8]">
          Tap a member to see their profile. Coordinators and administrators
          always keep posting access.
        </p>
      </div>
    </Sheet>
  )
}

// ─── One person's profile ───────────────────────────────────────────────────

export function ChatProfileSheet({
  conversation,
  participant,
  settings,
  busy,
  error,
  onClose,
  onBack,
  onMessage,
  onToggleCanPost,
}: {
  conversation: ChatConversation
  participant: ChatParticipant
  settings: ChatSettings
  busy: boolean
  error: string
  onClose: () => void
  /** Present when the profile was opened from the member list. */
  onBack?: () => void
  onMessage: (participant: ChatParticipant) => void
  onToggleCanPost: (participant: ChatParticipant) => void
}) {
  const alreadyDirect =
    conversation.kind === "direct" &&
    conversation.otherUserId === participant.userId
  const canMute =
    settings.canManage &&
    settings.postingMode === "everyone" &&
    conversation.kind === "organization" &&
    participant.role === "member" &&
    !participant.isSelf

  return (
    <Sheet label={`${participant.fullName} profile`} onClose={onClose}>
      <SheetHeader
        eyebrow="Profile"
        title={participant.fullName}
        detail={
          participant.isSelf ? "This is you" : roleDescription(participant.role)
        }
        left={
          onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to members"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D1D9E8] text-[#1B3A6B] hover:bg-[#F4F6FB]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.5 5.5-6 6.5 6 6.5"
                />
              </svg>
            </button>
          ) : undefined
        }
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-[#FDEDEC] px-3 py-2 text-[12px] font-semibold text-[#C0392B]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col items-center text-center">
          <Avatar
            name={participant.fullName}
            seed={participant.userId}
            size="lg"
            className={roleRingClass(participant.role)}
          />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <p className="text-xl font-extrabold text-[#1A202C]">
              {participant.fullName}
            </p>
            <RoleBadge role={participant.role} showMember />
            {participant.isSelf && (
              <span className="rounded-full bg-[#F4F6FB] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">
                You
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[#64748B]">
            {roleDescription(participant.role)}
          </p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            {participant.maskedEmail || "No email address on this account"}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-[#D1D9E8] bg-[#FCFCFE] p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Shared ministries
          </p>
          {participant.sharedOrganizations.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {participant.sharedOrganizations.map(ministry => (
                <span
                  key={ministry}
                  className="rounded-full bg-[#E8EDF7] px-2.5 py-1 text-[11px] font-bold text-[#1B3A6B]"
                >
                  {ministry}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-[#64748B]">
              No shared ministries with this account.
            </p>
          )}
          <div className="mt-3 border-t border-[#EEF1F6] pt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              In this chat
            </p>
            <p className="mt-1 text-sm text-[#475569]">
              {participant.isSelf
                ? "You are a member of this conversation."
                : `Joined ${formatJoinedDate(participant.joinedAt)}.`}
            </p>
            {conversation.kind === "organization" && (
              <p className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">
                {participant.role !== "member"
                  ? "This account keeps posting access as a coordinator or administrator."
                  : settings.postingMode === "leaders"
                    ? "Members are read-only while announcements-only is on."
                    : participant.canPost
                      ? "This member can send messages in the group."
                      : "This member is currently muted in the group."}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {!participant.isSelf && !alreadyDirect && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onMessage(participant)}
            >
              {busy ? "Opening…" : "Message privately"}
            </Button>
          )}
          {canMute && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggleCanPost(participant)}
              className={`min-h-12 rounded-xl border-2 px-4 text-[14px] font-bold transition-colors disabled:opacity-50 ${
                participant.canPost
                  ? "border-[#C0392B] text-[#C0392B] hover:bg-[#FDEDEC]"
                  : "border-[#2D7A4F] text-[#2D7A4F] hover:bg-[#E8F5EE]"
              }`}
            >
              {participant.canPost ? "Mute in this group" : "Allow messages"}
            </button>
          )}
          {participant.isSelf && (
            <p className="text-center text-[11px] text-[#94A3B8]">
              This is your profile as other members see it.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
