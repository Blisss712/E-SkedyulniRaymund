import { useState } from "react"

import { Button, useSheetClose } from "./ui"
import { NotificationCenter } from "./notifications"

export type HomeTab = "availability" | "slots" | "messages"

export type Ministry = {
  id: string

  name: string

  /** The organization this ministry belongs to, or a status such as "Waiting for approval". */
  parish: string

  waiting?: boolean
}

function MinistrySheet({
  ministries,

  selected,

  onSelect,

  onClose,

  onJoin,
}: {
  ministries: Ministry[]

  selected: Ministry | null

  onSelect: (ministry: Ministry) => void

  onClose: () => void

  onJoin: () => void
}) {
  const { closing, close } = useSheetClose()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="My Ministries"
      data-closing={closing}
    >
      <div
        className="sheet-backdrop absolute inset-0 bg-black/50"
        onClick={() => close(onClose)}
        aria-hidden="true"
      />
      <div className="sheet-panel relative w-full max-w-lg rounded-t-3xl bg-white px-5 pb-8 pt-4 shadow-2xl">
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-[#D1D9E8]" />
        <div className="mb-3 flex items-center justify-between">
          <p className="text-2xl font-bold text-[#1B3A6B]">My Ministries</p>
          <Button
            variant="ghost"
            size="compact"
            fullWidth={false}
            onClick={() => close(onClose)}
          >
            Close
          </Button>
        </div>
        <div className="divide-y divide-[#D1D9E8]">
          {ministries.length ? ministries.map((ministry) => (
            <button
              key={ministry.id}
              disabled={ministry.waiting}
              onClick={() => close(() => onSelect(ministry))}
              className="flex min-h-[72px] w-full items-center justify-between gap-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[18px] font-bold text-[#1A202C]">
                    {ministry.name}
                  </span>
                </div>
                <p className="mt-1 text-[16px] text-[#64748B]">
                  {ministry.waiting ? "Waiting for approval" : ministry.parish}
                </p>
              </div>
              {selected?.id === ministry.id && (
                <span
                  className="text-2xl font-bold text-[#2D7A4F]"
                  aria-label="Selected"
                >
                  ✓
                </span>
              )}
            </button>
          )) : (
            <p className="py-6 text-[16px] leading-relaxed text-[#64748B]">
              You haven't joined a ministry yet. Use the button below to send a
              request with your group code, or pick your ministry and ask an
              administrator to add you.
            </p>
          )}
        </div>
        <div className="mt-4 border-t border-[#D1D9E8] pt-4">
          <Button variant="secondary" onClick={onJoin}>
            + Join Another Ministry
          </Button>
        </div>
      </div>
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()

  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening"
}

export function HomeScreen({
  userName,

  ministries,

  ministry,

  onMinistryChange,

  tab,

  onTabChange,

  onJoin,

  onLogout,

  children,

  embedded = false,

  isAdmin = false,

  onAdmin, // the open tab's content

  isLeader = false,

  onLeader,

  onAssistant,

  unreadMessages = 0,
}: {
  userName: string

  /** The ministries the signed-in member belongs to, loaded from the organization tables. */
  ministries: Ministry[]

  ministry: Ministry | null

  onMinistryChange: (ministry: Ministry) => void

  tab: HomeTab

  onTabChange: (tab: HomeTab) => void

  onJoin: () => void

  onLogout: () => void

  children: React.ReactNode

  embedded?: boolean

  isAdmin?: boolean

  onAdmin?: () => void

  /** True when the account coordinates at least one ministry. */
  isLeader?: boolean

  onLeader?: () => void

  onAssistant?: () => void

  /** Unread messages across the member's conversations, shown on the tab. */
  unreadMessages?: number
}) {
  const [showMinistries, setShowMinistries] = useState(false)

  // The Availability tab holds the weekly timetable, so it gets the wide layout.

  const wide = tab === "availability"

  function switchMinistry(next: Ministry) {
    onMinistryChange(next)

    setShowMinistries(false)
  }

  return (
    <div
      className={`${embedded ? "" : "min-h-screen bg-[#F4F6FB]"}`}
      style={{
        paddingBottom: embedded
          ? undefined
          : "calc(7rem + env(safe-area-inset-bottom))",
      }}
    >
      <div
        className={embedded ? "mb-5" : "bg-[#1B3A6B] px-4 pb-5 text-white"}
        style={
          embedded
            ? undefined
            : { paddingTop: "calc(2.5rem + env(safe-area-inset-top))" }
        }
      >
        <div className={`mx-auto ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          {embedded && (
            <div className="mb-3 flex justify-end">
              <NotificationCenter embedded />
            </div>
          )}
          {!embedded && (
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[16px] text-white/70">
                  {greeting()}, {userName.split(" ")[0]}
                </p>
                <p className="text-xl font-bold">E-Skedyul</p>
              </div>
              <div className="flex items-center gap-2">
                <NotificationCenter />
                {isAdmin && onAdmin && (
                  <button
                    type="button"
                    onClick={onAdmin}
                    className="rounded-xl border border-[#C9921A] bg-[#C9921A] px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#B78216] cursor-pointer"
                  >
                    Admin Workspace →
                  </button>
                )}
                {isLeader && onLeader && (
                  <button
                    type="button"
                    onClick={onLeader}
                    className="rounded-xl border border-[#C9921A] bg-[#C9921A] px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#B78216] cursor-pointer"
                  >
                    Coordinator Workspace →
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Log out
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowMinistries(true)}
            className={`flex min-h-[64px] w-full items-center justify-between rounded-2xl px-5 text-left shadow-sm ${
              embedded
                ? "border border-border bg-white text-navy"
                : "bg-white text-[#1B3A6B]"
            }`}
          >
            <div>
              <p className="text-[14px] font-semibold text-[#64748B]">
                Current ministry
              </p>
              <p className="text-xl font-extrabold">
                {ministry ? `${ministry.name} ▾` : "Join a ministry ▾"}
              </p>
            </div>
          </button>
        </div>
      </div>

      <main
        className={
          embedded
            ? ""
            : `mx-auto px-4 py-5 ${wide ? "max-w-6xl" : "max-w-3xl"}`
        }
      >
        {children}
      </main>

      <nav
        className={`${
          embedded
            ? "w-full"
            : "fixed bottom-3 inset-x-0 z-30 w-[calc(100%-1.5rem)]"
        } mx-auto grid max-w-3xl grid-cols-3 gap-1 rounded-3xl border border-white/70 bg-white/60 p-2 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_30px_rgba(27,58,107,0.18)]`}
        style={
          embedded
            ? undefined
            : { bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }
        }
      >
        {([
          ["availability", "Availability"],

          ["slots", "Open Slots"],

          ["messages", "Messages"],
        ] as Array<[HomeTab, string]>).map(([value, label]) => (
          <button
            key={value}
            onClick={() => onTabChange(value)}
            className={`relative flex min-h-[52px] items-center justify-center rounded-2xl px-1.5 text-[13px] font-bold transition-all duration-200 sm:px-2 sm:text-[15px] ${
              tab === value
                ? "bg-[#1B3A6B]/10 text-[#1B3A6B] ring-1 ring-[#1B3A6B]/15 shadow-sm"
                : "text-[#64748B] hover:bg-white/50"
            }`}
          >
            {label}
            {value === "messages" && unreadMessages > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C0392B] px-1 text-[10px] font-extrabold text-white">
                {unreadMessages > 99 ? "99+" : unreadMessages}
              </span>
            )}
          </button>
        ))}
      </nav>

      {onAssistant && (
        <button
          type="button"
          onClick={onAssistant}
          aria-label="Open AI assistant"
          title="Ask the AI assistant about your events and group messages"
          className="fixed right-5 z-40 flex h-[52px] items-center gap-2.5 rounded-full border-4 border-white bg-[#1B3A6B] pl-3.5 pr-[18px] text-white shadow-[0_8px_24px_rgba(27,58,107,0.3)] transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#C9921A]/40 active:scale-95"
          style={{
            bottom: embedded
              ? "1.25rem"
              : "calc(5.75rem + env(safe-area-inset-bottom))",
          }}
        >
          <span
            className="pointer-events-none absolute inset-1 rounded-full border-2 border-[#C9921A]/80"
            aria-hidden="true"
          />
          {/* A sparkle mark plus a label, so it reads as the AI assistant, not chat. */}
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="relative h-[22px] w-[22px] shrink-0"
            aria-hidden="true"
          >
            <path d="M12 1.4C12.65 7.2 16.8 11.35 22.6 12 16.8 12.65 12.65 16.8 12 22.6 11.35 16.8 7.2 12.65 1.4 12 7.2 11.35 11.35 7.2 12 1.4Z" />
          </svg>
          <span className="relative whitespace-nowrap text-[13px] font-bold leading-none tracking-wide">
            AI Assistant
          </span>
        </button>
      )}

      {showMinistries && (
        <MinistrySheet
          ministries={ministries}
          selected={ministry}
          onClose={() => setShowMinistries(false)}
          onSelect={switchMinistry}
          onJoin={onJoin}
        />
      )}
    </div>
  )
}
