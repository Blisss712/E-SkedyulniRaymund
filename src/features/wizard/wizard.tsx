import { useState } from "react"

import type { FormData } from "./types"

import {
  ScreenShell,
  Card,
  Logo,
  Button,
  InputField,
  BackButton,
  ClockIcon,
} from "../../shared/ui"

import { EXAMPLE_GROUPS, PENDING_STEPS } from "./data"

export function WelcomeScreen({
  onStart,

  onAuth,

  onAdmin,

  currentUserName,

  onContinueAsUser,

  isAdmin = false,

  onOpenAdmin,
}: {
  onStart: () => void

  onAuth: () => void

  onAdmin: () => void

  currentUserName?: string | null

  onContinueAsUser?: () => void

  isAdmin?: boolean

  onOpenAdmin?: () => void
}) {
  return (
    <ScreenShell>
      <div className="mt-12 flex flex-col items-center gap-9">
        <div className="flex flex-col items-center gap-4">
          <div className="p-5 bg-[#1B3A6B] rounded-[22px] shadow-lg">
            <svg
              width="56"
              height="56"
              viewBox="0 0 56 56"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M28 4v8M24 8h8"
                stroke="#C9921A"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <rect
                x="16"
                y="16"
                width="24"
                height="30"
                rx="2"
                stroke="white"
                strokeWidth="2.5"
                fill="none"
              />
              <path
                d="M22 46V34h12v12"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M16 26h24" stroke="white" strokeWidth="2" />
              <path d="M16 34h24" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-[#1B3A6B] tracking-tight leading-none">
              E-Skedyul
            </h1>
            <p className="mt-3 text-[18px] font-medium text-[#64748B]">
              Your ministry schedule, made simple.
            </p>
          </div>
        </div>

        <div className="text-center px-2">
          <p className="text-xl font-semibold leading-relaxed text-[#1A202C]">
            Share when you&apos;re available and volunteer when your ministry
            needs help.
          </p>
        </div>

        {currentUserName ? (
          <div className="w-full flex flex-col gap-3 rounded-2xl bg-white border border-[#D1D9E8] p-5 text-center shadow-sm">
            <div className="flex items-center justify-center gap-2">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  isAdmin
                    ? "bg-[#C9921A] text-white"
                    : "bg-[#1B3A6B]/10 text-[#1B3A6B]"
                }`}
              >
                {isAdmin ? "Administrator Session" : "Active Session"}
              </span>
            </div>
            <p className="text-xl font-bold text-[#1B3A6B]">
              {currentUserName}
            </p>
            {isAdmin && onOpenAdmin ? (
              <>
                <Button onClick={onOpenAdmin}>Open Admin Workspace</Button>
                {onContinueAsUser && (
                  <Button onClick={onContinueAsUser} variant="secondary">
                    Open Member Schedule
                  </Button>
                )}
              </>
            ) : (
              <>
                {onContinueAsUser && (
                  <Button onClick={onContinueAsUser}>Open Dashboard</Button>
                )}
                <Button onClick={onAdmin} variant="secondary">
                  Sign in as Admin
                </Button>
              </>
            )}
            <Button onClick={onAuth} variant="ghost" size="compact">
              Switch Account / Sign In
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-3">
            <Button onClick={onAuth}>Sign In / Register</Button>
            <Button onClick={onStart} variant="secondary">
              Get Started as Guest
            </Button>
            <Button onClick={onAdmin} variant="ghost">
              Sign in as Admin
            </Button>
          </div>
        )}
      </div>
    </ScreenShell>
  )
}

const PARISH_ROLES = [
  { id: "lector",    label: "Lector",                  icon: "📖" },
  { id: "altar",     label: "Altar Server",             icon: "✝️" },
  { id: "choir",     label: "Choir Member",             icon: "🎵" },
  { id: "emhc",      label: "Extraordinary Minister",   icon: "🕊️" },
  { id: "ushers",    label: "Usher / Greeter",          icon: "🤝" },
  { id: "parish",    label: "Parishioner",              icon: "⛪" },
]

export function TellNameScreen({
  onContinue,
  setFirstName,
}: {
  firstName: string
  lastName: string
  setFirstName: (value: string) => void
  setLastName: (value: string) => void
  onContinue: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState("")

  function continueToApp() {
    if (!selected) {
      setError("Please select your role in the parish.")
      return
    }
    const role = PARISH_ROLES.find((r) => r.id === selected)
    setFirstName(role?.label ?? "Parishioner")
    setError("")
    onContinue()
  }

  return (
    <ScreenShell>
      <div className="mb-8 flex justify-center">
        <Logo size="md" />
      </div>
      <Card>
        <p className="text-2xl font-bold text-[#1B3A6B]">Welcome, parish member!</p>
        <p className="mb-1 mt-2 text-[15px] leading-relaxed text-[#64748B]">
          Tell us who is joining. It takes one tap and helps the coordinator plan better. No sign-in needed.
        </p>

        <p className="mt-5 mb-3 text-[13px] font-bold uppercase tracking-widest text-[#94A3B8]">
          I AM A
        </p>

        <div className="grid grid-cols-2 gap-3 mb-2">
          {PARISH_ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                setSelected(role.id)
                setError("")
              }}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-3 py-4 text-center font-bold transition-all cursor-pointer ${
                selected === role.id
                  ? "border-[#1B3A6B] bg-[#1B3A6B] text-white shadow-md scale-[1.03]"
                  : "border-[#D1D9E8] bg-white text-[#1A202C] hover:border-[#1B3A6B] hover:bg-[#F4F6FB]"
              }`}
            >
              <span className="text-2xl" role="img" aria-hidden="true">{role.icon}</span>
              <span className="text-[14px] leading-tight">{role.label}</span>
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[14px] font-medium text-[#C0392B]">
            {error}
          </p>
        )}

        <div className="mt-5">
          <Button onClick={continueToApp}>Enter the live schedule →</Button>
        </div>
      </Card>
    </ScreenShell>
  )
}

export function JoinGroupScreen({
  data,
  setData,
  onJoin,
  onBack,
}: {
  data: FormData
  setData: (d: Partial<FormData>) => void
  onJoin: () => void
  onBack: () => void
}) {
  const [error, setError] = useState("")

  const [pasteMode, setPasteMode] = useState(false)

  const [pasteLink, setPasteLink] = useState("")

  function handleJoin() {
    const code = pasteMode
      ? (pasteLink.split("/").pop() || "").toUpperCase().trim()
      : data.groupCode.trim().toUpperCase()

    if (!code) {
      setError("Please enter a group code to continue.")
      return
    }

    const groupName = EXAMPLE_GROUPS[code]

    if (!groupName) {
      setError(
        "We couldn't find a group with that code. Please check with your group leader and try again.",
      )
      return
    }

    setData({ groupCode: code, groupName })
    setError("")
    onJoin()
  }

  return (
    <ScreenShell>
      <BackButton onClick={onBack} />
      <div className="flex flex-col items-center mb-6">
        <h2 className="text-2xl font-bold text-[#1B3A6B] text-center">
          Join a Ministry Group
        </h2>
        <p className="text-[#64748B] text-[17px] mt-2 text-center">
          Enter the group code given to you by your group leader or coordinator.
        </p>
      </div>
      <Card>
        <div className="flex flex-col gap-6">
          {!pasteMode ? (
            <>
              <InputField
                label="Group Code"
                id="group-code"
                value={data.groupCode}
                onChange={(v) => setData({ groupCode: v })}
                helper="Your group leader gave you this code. Example: LECT-2024"
                error={error}
                placeholder="Example: LECT-2024"
                autoComplete="off"
              />
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#D1D9E8]" />
                <span className="text-[#94A3B8] text-[14px] font-medium">
                  or
                </span>
                <div className="flex-1 h-px bg-[#D1D9E8]" />
              </div>
              <button
                onClick={() => {
                  setPasteMode(true)
                  setError("")
                }}
                className="min-h-[52px] w-full rounded-xl border-2 border-dashed border-[#9BA8C0] text-[#1B3A6B] font-semibold text-[16px] flex items-center justify-center gap-2 hover:border-[#1B3A6B] hover:bg-[#F4F6FB] transition-colors cursor-pointer"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="2"
                    width="11"
                    height="14"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  />
                  <path
                    d="M7 6h7M7 9h7M7 12h4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6 5V3.5A1.5 1.5 0 0 1 7.5 2h9A1.5 1.5 0 0 1 18 3.5v11a1.5 1.5 0 0 1-1.5 1.5H15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Paste a Group Link Instead
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setPasteMode(false)
                  setError("")
                }}
                className="text-[#64748B] text-[15px] hover:text-[#1B3A6B] transition-colors text-left cursor-pointer flex items-center gap-1 -mb-2"
              >
                ← Back to entering a code
              </button>
              <InputField
                label="Paste Your Group Link"
                id="paste-link"
                value={pasteLink}
                onChange={setPasteLink}
                helper="Paste the link you received. It ends with your group code."
                error={error}
                placeholder="https://eskedyul.ph/join/LECT-2024"
                autoComplete="off"
              />
            </>
          )}
          <Button onClick={handleJoin} variant="primary">
            Join This Group
          </Button>
        </div>
      </Card>
    </ScreenShell>
  )
}

export function PendingScreen({
  data,
  onBack,
  onApproved,
}: {
  data: FormData
  onBack: () => void
  onApproved: () => void
}) {
  return (
    <ScreenShell>
      <div className="flex flex-col items-center gap-7 mt-6">
        <ClockIcon />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#C9921A] mb-2">
            Your request is on its way!
          </h2>
          <p className="text-[#1A202C] text-[17px] leading-relaxed">
            You've asked to join the <strong>{data.groupName}</strong> group.
          </p>
        </div>
        <div className="bg-[#FEF3DC] border border-[#C9921A]/30 rounded-2xl p-6 w-full">
          <p className="text-[#1A202C] text-[17px] leading-relaxed">
            The group leader needs to approve your request. This usually happens
            within 1–2 days.
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          <div className="bg-white border border-[#D1D9E8] rounded-xl p-4">
            <p className="text-[#64748B] text-[15px] font-semibold uppercase tracking-wide mb-1">
              What's next?
            </p>
            <ol className="flex flex-col gap-2">
              {PENDING_STEPS.map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-[15px] text-[#1A202C]"
                >
                  <span className="min-w-[24px] h-6 rounded-full bg-[#C9921A]/15 text-[#C9921A] font-bold text-[13px] flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="w-full border-t border-[#D1D9E8] pt-5 flex flex-col gap-3">
          <p className="text-[#94A3B8] text-[14px] text-center">
            (Demo only) Simulate what happens after the group leader approves
            you:
          </p>
          <Button onClick={onApproved} variant="primary">
            I've Been Approved — Continue
          </Button>
          <Button onClick={onBack} variant="ghost">
            ← Start Over
          </Button>
        </div>
      </div>
    </ScreenShell>
  )
}
