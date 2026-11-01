import { useEffect, useMemo, useState } from "react"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { useAuth } from "../features/auth/AuthContext"

type NotificationKind =
  | "schedule"
  | "approval"
  | "slot"
  | "event"
  | "event_reminder"

type Notification = {
  id: string
  title: string
  message: string
  time: string
  kind: NotificationKind
  unread: boolean
}

const STORAGE_KEY = "e-skedyul-notifications"

const initialNotifications: Notification[] = [
  {
    id: "schedule-1",
    title: "Upcoming schedule",
    message: "You are scheduled to serve this Sunday at 9:00 AM.",
    time: "Today",
    kind: "schedule",
    unread: true,
  },
  {
    id: "approval-1",
    title: "Ministry request approved",
    message: "Your request to join the Parish Choir was approved.",
    time: "Yesterday",
    kind: "approval",
    unread: true,
  },
  {
    id: "slot-1",
    title: "New open slot",
    message: "An open serving slot is available for Saturday evening.",
    time: "2 days ago",
    kind: "slot",
    unread: false,
  },
]

function readNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return initialNotifications

    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as Notification[]) : initialNotifications
  } catch {
    return initialNotifications
  }
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const elapsed = Date.now() - date.getTime()
  if (elapsed < 60_000) return "Just now"
  if (elapsed < 60 * 60_000) {
    return `${Math.floor(elapsed / 60_000)} min ago`
  }
  if (elapsed < 24 * 60 * 60_000) {
    return `${Math.floor(elapsed / (60 * 60_000))} hr ago`
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function fromDatabaseRow(row: {
  id: string
  title: string
  message: string
  kind: NotificationKind
  read_at: string | null
  created_at: string
}): Notification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    time: formatTime(row.created_at),
    kind: row.kind,
    unread: row.read_at === null,
  }
}

function iconFor(kind: NotificationKind) {
  if (kind === "event" || kind === "event_reminder") return "!"
  if (kind === "schedule") return "◷"
  if (kind === "approval") return "✓"
  return "✦"
}

function colorFor(kind: NotificationKind) {
  if (kind === "event_reminder") return "bg-[#C0392B]"
  if (kind === "event") return "bg-[#1B3A6B]"
  if (kind === "schedule") return "bg-[#1B3A6B]"
  if (kind === "approval") return "bg-[#2D7A4F]"
  return "bg-[#C9921A]"
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }
    return entities[character]
  })
}

export function NotificationCenter({
  embedded = false,
}: {
  embedded?: boolean
}) {
  const { user } = useAuth()
  const [notifications, setNotifications] =
    useState<Notification[]>(readNotifications)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [backendError, setBackendError] = useState<string | null>(null)

  const unreadCount = notifications.filter((notification) => notification.unread).length
  const visibleNotifications = useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((notification) => notification.unread)
        : notifications,
    [filter, notifications],
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
  }, [notifications])

  useEffect(() => {
    let active = true

    async function loadNotifications() {
      if (!isSupabaseConfigured || !user) {
        if (active) setNotifications(readNotifications())
        return
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, kind, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)

      if (!active) return
      if (error) {
        console.error("Unable to load notifications:", error)
        setBackendError("Notifications are temporarily offline.")
        setNotifications(readNotifications())
        return
      }

      setBackendError(null)
      setNotifications((data ?? []).map(fromDatabaseRow))
    }

    void loadNotifications()

    if (!isSupabaseConfigured || !user) {
      return () => {
        active = false
      }
    }

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadNotifications()
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Unable to subscribe to notification updates.")
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return
      if (!event.target.closest("[data-notification-center]")) setOpen(false)
    }

    document.addEventListener("click", closeOnOutsideClick)
    return () => document.removeEventListener("click", closeOnOutsideClick)
  }, [])

  function markAllRead() {
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, unread: false })),
    )
    if (isSupabaseConfigured && user) {
      void supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null)
        .then(({ error }) => {
          if (error) {
            console.error("Unable to mark notifications as read:", error)
            setBackendError("Could not sync notification changes.")
          }
        })
    }
  }

  function markRead(id: string) {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, unread: false } : notification,
      ),
    )
    if (isSupabaseConfigured && user) {
      void supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) {
            console.error("Unable to mark notification as read:", error)
            setBackendError("Could not sync notification changes.")
          }
        })
    }
  }

  function remove(id: string) {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== id),
    )
    if (isSupabaseConfigured && user) {
      void supabase
        .from("notifications")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) {
            console.error("Unable to dismiss notification:", error)
            setBackendError("Could not sync notification changes.")
          }
        })
    }
  }

  function simulateNotification() {
    const notification = {
      user_id: user?.id,
      title: "New schedule update",
      message: "A new activity was added to your ministry schedule.",
      kind: "schedule" as const,
    }

    if (isSupabaseConfigured && user) {
      void supabase
        .from("notifications")
        .insert(notification)
        .then(({ error }) => {
          if (error) {
            console.error("Unable to create notification:", error)
            setBackendError("Could not create a notification.")
          }
        })
    } else {
      setNotifications((current) => [
        {
          id: `activity-${Date.now()}`,
          title: notification.title,
          message: notification.message,
          time: "Just now",
          kind: notification.kind,
          unread: true,
        },
        ...current,
      ])
    }
    setOpen(true)
  }

  function clearAll() {
    setNotifications([])
    if (isSupabaseConfigured && user) {
      void supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) {
            console.error("Unable to clear notifications:", error)
            setBackendError("Could not sync notification changes.")
          }
        })
    }
  }

  const panelNotifications = visibleNotifications
  const emptyMessage =
    filter === "unread"
      ? "You have no unread notifications."
      : "New activity will appear here."

  return (
    <div
      className="relative"
      data-notification-center
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
          embedded
            ? "border-[#D1D9E8] bg-white text-[#1B3A6B] hover:bg-[#F4F6FB]"
            : "border-white/30 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-6 w-6"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-[#C0392B] px-1 text-[11px] font-extrabold text-white ${
              embedded ? "ring-2 ring-white" : "ring-2 ring-[#1B3A6B]"
            }`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          id="notification-panel"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#D1D9E8] bg-white text-[#1A202C] shadow-[0_16px_40px_rgba(27,58,107,0.2)]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#D1D9E8] px-4 pb-3 pt-4">
            <div>
              <h2 className="text-base font-extrabold text-[#1B3A6B]">
                Notifications
              </h2>
              <p className="mt-1 text-xs text-[#64748B]">
                {unreadCount === 0
                  ? "You’re all caught up."
                  : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
              </p>
              {backendError && (
                <p className="mt-1 text-[11px] font-semibold text-[#C0392B]">
                  {backendError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="text-xs font-bold text-[#1B3A6B] hover:text-[#C9921A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          <div className="flex gap-1 border-b border-[#D1D9E8] px-4 py-2">
            {(["all", "unread"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${
                  filter === value
                    ? "bg-[#E8EDF7] text-[#1B3A6B]"
                    : "text-[#64748B] hover:bg-[#F4F6FB]"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {panelNotifications.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5EE] text-lg font-bold text-[#2D7A4F]">
                  ✓
                </span>
                <p className="text-sm font-bold text-[#1A202C]">
                  No notifications here
                </p>
                <p className="mt-1 text-xs text-[#64748B]">{emptyMessage}</p>
              </div>
            ) : (
              panelNotifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`flex gap-3 border-b border-[#EEF1F6] px-4 py-3 ${
                    notification.unread ? "bg-[#FAFBFF]" : ""
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${colorFor(notification.kind)}`}
                    aria-hidden="true"
                  >
                    {iconFor(notification.kind)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold text-[#1A202C]">
                      {notification.title}
                      {notification.unread && (
                        <span
                          className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#1B3A6B] align-middle"
                          aria-label="Unread"
                        />
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-[11px] text-[#94A3B8]">
                      {notification.time}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    {notification.unread && (
                      <button
                        type="button"
                        onClick={() => markRead(notification.id)}
                        aria-label={`Mark ${escapeHtml(notification.title)} as read`}
                        title="Mark as read"
                        className="p-1 text-sm text-[#94A3B8] hover:text-[#1B3A6B]"
                      >
                        ✓
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(notification.id)}
                      aria-label={`Dismiss ${escapeHtml(notification.title)}`}
                      title="Dismiss"
                      className="p-1 text-base leading-none text-[#94A3B8] hover:text-[#C0392B]"
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="flex items-center justify-between bg-[#FCFCFE] px-4 py-3">
            <button
              type="button"
              onClick={simulateNotification}
              className="text-xs font-bold text-[#1B3A6B] hover:text-[#C9921A]"
            >
              + Simulate notification
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={notifications.length === 0}
              className="text-xs font-bold text-[#64748B] hover:text-[#C0392B] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
