import { useState } from "react"
import type { FormData, JoinTarget } from "./types"
import { Button, InputField, Card, BackButton, ClockIcon } from "../../shared/ui"
import { EXAMPLE_GROUPS } from "./data"
import { resolveGroup, groupCodeFromLink, usesSampleGroups } from "./joinGroups"
import { useMinistryOptions, type MinistryOption } from "./ministryOptions"
import { MinistryRequestPicker, toggleMinistry, type MinistryRequestProgress } from "./requestAccess"
import { JoinRequestOutcome } from "./requestStatus"

// ─── Layout ───────────────────────────────────────────────────────────────────

function DesktopBrandPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-between bg-[#1B3A6B] text-white p-12 min-h-screen w-[480px] flex-shrink-0 relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute bottom-32 -right-16 w-48 h-48 rounded-full bg-[#C9921A]/15 pointer-events-none" />
      <div className="absolute top-1/2 -right-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-white/10 rounded-2xl">
            <svg width="40" height="40" viewBox="0 0 56 56" fill="none" aria-hidden="true">
              <path d="M28 4v8M24 8h8" stroke="#C9921A" strokeWidth="3.5" strokeLinecap="round" />
              <rect x="16" y="16" width="24" height="30" rx="2" stroke="white" strokeWidth="2.5" fill="none" />
              <path d="M22 46V34h12v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 26h24M16 34h24" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight leading-none">E-Skedyul</h1>
            <p className="text-white/60 text-[15px] font-medium mt-0.5">Parish & Ministry Scheduler</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-8">
        <div className="flex justify-center">
          <svg width="120" height="140" viewBox="0 0 120 140" fill="none" aria-hidden="true">
            <rect x="50" y="0" width="20" height="140" rx="6" fill="white" opacity="0.08" />
            <rect x="0" y="44" width="120" height="20" rx="6" fill="white" opacity="0.08" />
            <rect x="53" y="3" width="14" height="134" rx="4" fill="#C9921A" opacity="0.6" />
            <rect x="3" y="47" width="114" height="14" rx="4" fill="#C9921A" opacity="0.6" />
            <circle cx="60" cy="54" r="18" fill="#1B3A6B" stroke="#C9921A" strokeWidth="2.5" />
            <path d="M53 54l5 5 9-10" stroke="#C9921A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold leading-snug mb-3">Organize your ministry.<br />Serve with clarity.</h2>
          <p className="text-white/70 text-[16px] leading-relaxed">E-Skedyul helps ministry members join their group, share when they're available, and volunteer for open slots.</p>
        </div>
        <div className="flex flex-col gap-4">
          {[{ icon: "👥", text: "Join Lectors, Altar Servers, Choir & more" }].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[20px] flex-shrink-0">{icon}</span>
              <span className="text-white/80 text-[15px] font-medium">{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10">
        <p className="text-white/40 text-[13px]">For parishioners and ministry staff only.</p>
      </div>
    </div>
  )
}

function DesktopFormPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#F4F6FB] min-h-screen px-12 py-12">
      <div className="w-full max-w-[480px]">{children}</div>
    </div>
  )
}

// ─── Desktop Wizard Screens ───────────────────────────────────────────────────

export function DesktopJoinGroupScreen({ data, setData, onJoin, onBack }: {
  data: FormData
  setData: (d: Partial<FormData>) => void
  onJoin: (groups: JoinTarget[]) => Promise<void>
  onBack: () => void
}) {
  const [error, setError] = useState("")
  /** False: enter a join code. True: ask an administrator to add the member. */
  const [requestMode, setRequestMode] = useState(false)
  const [selected, setSelected] = useState<MinistryOption[]>([])
  const [busy, setBusy] = useState(false)
  const { options, loading, loadError } = useMinistryOptions(requestMode)

  /** Every ministry in the request becomes its own join request. */
  async function submit(joins: JoinTarget[]) {
    setBusy(true)
    try {
      setData({
        groupCode: joins[0]?.groupCode ?? "",
        groupName: joins.map(join => join.groupName).join(", "),
        groupNames: joins.map(join => join.groupName),
      })
      setError("")
      await onJoin(joins)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit the group request.")
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin() {
    // A pasted join link still works: only its last segment is the code.
    const code = groupCodeFromLink(data.groupCode)
    if (!code) { setError("Please enter a group code to continue."); return }
    try {
      const group = await resolveGroup(code)
      if (!group.name) {
        setError("We couldn't find a group with that code. Please check with your group leader and try again.")
        return
      }
      await submit([{ groupCode: code, groupName: group.name, organizationId: group.id }])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit the group request.")
    }
  }

  async function handleRequest() {
    if (selected.length === 0) { setError("Choose at least one ministry you want to join."); return }
    await submit(selected.map(option => ({
      groupCode: "",
      groupName: option.name,
      organizationId: option.id,
    })))
  }

  const requestUnavailable = requestMode && (loading || options.length === 0)
  const submitLabel = busy
    ? "Sending…"
    : !requestMode
      ? "Join This Group"
      : selected.length > 1
        ? `Send ${selected.length} Requests to Administrator`
        : "Send Request to Administrator"

  return (
    <div className="flex min-h-screen">
      <DesktopBrandPanel />
      <DesktopFormPanel>
        <BackButton onClick={onBack} />
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#1B3A6B] mb-1">Join a Ministry Group</h2>
          <p className="text-[#64748B] text-[17px]">
            {requestMode
              ? "No group code? Pick your ministries and ask an administrator to add you."
              : "Enter the group code given to you by your group leader or coordinator."}
          </p>
        </div>
        <Card>
          <div className="flex flex-col gap-6">
            {!requestMode ? (
              <>
                <InputField label="Group Code" id="d-group-code" value={data.groupCode} onChange={v => setData({ groupCode: v })} helper={usesSampleGroups ? "Your group leader gave you this code. Example: LECT-2024" : "Use the join code your group leader shared with you."} error={error} placeholder={usesSampleGroups ? "Example: LECT-2024" : "Enter your group code"} autoComplete="off" />
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#D1D9E8]" /><span className="text-[#94A3B8] text-[14px] font-medium">or</span><div className="flex-1 h-px bg-[#D1D9E8]" />
                </div>
                <button onClick={() => { setRequestMode(true); setError("") }} className="min-h-[52px] w-full rounded-xl border-2 border-dashed border-[#9BA8C0] text-[#1B3A6B] font-semibold text-[16px] flex items-center justify-center gap-2 hover:border-[#1B3A6B] hover:bg-[#F4F6FB] transition-colors cursor-pointer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                  </svg>
                  Request Access from an Administrator
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setRequestMode(false); setError("") }} className="text-[#64748B] text-[15px] hover:text-[#1B3A6B] transition-colors text-left cursor-pointer flex items-center gap-1 -mb-2">← Back to entering a code</button>
                <MinistryRequestPicker
                  options={options}
                  loading={loading}
                  loadError={loadError}
                  selected={selected}
                  onToggle={option => {
                    setSelected(current => toggleMinistry(current, option))
                    setError("")
                  }}
                  onSelectAll={selectAll => {
                    setSelected(selectAll ? [...options] : [])
                    setError("")
                  }}
                  error={error}
                />
              </>
            )}
            <Button onClick={requestMode ? handleRequest : handleJoin} variant="primary" disabled={busy || requestUnavailable}>
              {submitLabel}
            </Button>
          </div>
        </Card>
        {usesSampleGroups && <div className="mt-5 bg-[#EFF6FF] border border-[#2563EB]/20 rounded-xl p-4">
          <p className="text-[#2563EB] font-semibold text-[15px] mb-2">Try these sample codes:</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(EXAMPLE_GROUPS).map(code => (
              <button key={code} onClick={() => { setData({ groupCode: code }); setRequestMode(false); setError("") }} className="font-mono bg-white text-[#1B3A6B] border border-[#D1D9E8] rounded-lg px-3 py-1.5 text-[14px] font-semibold hover:border-[#1B3A6B] transition-colors cursor-pointer">{code}</button>
            ))}
          </div>
        </div>
        }
      </DesktopFormPanel>
    </div>
  )
}

export function DesktopPendingScreen({ data, progress, onBack, onApproved }: {
  data: FormData; progress: MinistryRequestProgress[]; onBack: () => void; onApproved: () => void
}) {
  return (
    <div className="flex min-h-screen">
      <DesktopBrandPanel />
      <DesktopFormPanel>
        <div className="flex flex-col items-center gap-7">
          <ClockIcon />
          <JoinRequestOutcome
            progress={progress}
            fallbackName={data.groupName}
            onBack={onBack}
            onApproved={onApproved}
          />
        </div>
      </DesktopFormPanel>
    </div>
  )
}
