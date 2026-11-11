import { useState } from "react"
import type { FormData, JoinTarget } from "./types"
import { ScreenShell, Card, Logo, Button, InputField, BackButton, ClockIcon } from "../../shared/ui"
import { EXAMPLE_GROUPS } from "./data"
import { resolveGroup, groupCodeFromLink, usesSampleGroups } from "./joinGroups"
import { useMinistryOptions, type MinistryOption } from "./ministryOptions"
import { MinistryRequestPicker, toggleMinistry, type MinistryRequestProgress } from "./requestAccess"
import { JoinRequestOutcome } from "./requestStatus"

export function WelcomeScreen({ onStart, onSignIn, onAdmin, onCoordinator, accountsEnabled = false }: {
  onStart: () => void
  onSignIn: () => void
  onAdmin: () => void
  onCoordinator: () => void
  accountsEnabled?: boolean
}) {
  return (
    <ScreenShell>
      <div className="mt-10 flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <div className="p-5 bg-[#1B3A6B] rounded-[22px] shadow-lg">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
              <path d="M28 4v8M24 8h8" stroke="#C9921A" strokeWidth="3.5" strokeLinecap="round" />
              <rect x="16" y="16" width="24" height="30" rx="2" stroke="white" strokeWidth="2.5" fill="none" />
              <path d="M22 46V34h12v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 26h24" stroke="white" strokeWidth="2" />
              <path d="M16 34h24" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-[#1B3A6B] tracking-tight leading-none">E-Skedyul</h1>
            <p className="mt-3 text-[18px] font-medium text-[#64748B]">Your ministry schedule, made simple.</p>
          </div>
        </div>

        <div className="text-center px-2">
          <p className="text-xl font-semibold leading-relaxed text-[#1A202C]">Share when you're available and volunteer when your ministry needs help.</p>
        </div>

        <div className="flex w-full flex-col items-center gap-3">
          <Button onClick={onStart}>{accountsEnabled ? "Create account" : "Get Started"}</Button>
          <Button onClick={onSignIn} variant="secondary">Sign in</Button>
        </div>

        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#D1D9E8]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Parish staff</span>
            <div className="h-px flex-1 bg-[#D1D9E8]" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Button onClick={onAdmin} variant="ghost" size="compact">Admin sign in</Button>
            <Button onClick={onCoordinator} variant="ghost" size="compact">Leader / Coordinator sign in</Button>
          </div>
        </div>

        <p className="text-center text-[15px] leading-relaxed text-[#64748B]">
          {accountsEnabled
            ? "Already have an account? Choose Sign in to return to your ministry schedule."
            : "Member accounts are not connected yet. Add your Supabase keys to .env.local, or continue as a guest."}
        </p>
      </div>
    </ScreenShell>
  )
}

export function TellNameScreen({ firstName, lastName, setFirstName, setLastName, onContinue }: {
  firstName: string
  lastName: string
  setFirstName: (value: string) => void
  setLastName: (value: string) => void
  onContinue: () => void
}) {
  const [error, setError] = useState("")

  function continueToApp() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.")
      return
    }
    setError("")
    onContinue()
  }

  return (
    <ScreenShell>
      <div className="mb-8 flex justify-center"><Logo size="md" /></div>
      <Card>
        <p className="text-2xl font-bold text-[#1B3A6B]">Tell us your name</p>
        <p className="mb-6 mt-2 text-[18px] leading-relaxed text-[#64748B]">This is how your name will appear to your ministries.</p>
        <div className="flex flex-col gap-5">
          <InputField label="First Name" id="first-name" value={firstName} onChange={setFirstName} placeholder="First name" autoComplete="given-name" />
          <InputField label="Last Name" id="last-name" value={lastName} onChange={setLastName} placeholder="Last name" autoComplete="family-name" />
          {error && <p role="alert" className="text-[16px] font-medium text-[#C0392B]">{error}</p>}
          <Button onClick={continueToApp}>Continue</Button>
        </div>
      </Card>
    </ScreenShell>
  )
}

export function JoinGroupScreen({
  data, setData, onJoin, onBack,
}: {
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
    <ScreenShell>
      <BackButton onClick={onBack} />
      <div className="flex flex-col items-center mb-6">
        <h2 className="text-2xl font-bold text-[#1B3A6B] text-center">Join a Ministry Group</h2>
        <p className="text-[#64748B] text-[17px] mt-2 text-center">
          {requestMode
            ? "No group code? Pick your ministries and ask an administrator to add you."
            : "Enter the group code given to you by your group leader or coordinator."}
        </p>
      </div>
      <Card>
        <div className="flex flex-col gap-6">
          {!requestMode ? (
            <>
              <InputField label="Group Code" id="group-code" value={data.groupCode} onChange={v => setData({ groupCode: v })} helper={usesSampleGroups ? "Your group leader gave you this code. Example: LECT-2024" : "Use the join code your group leader shared with you."} error={error} placeholder={usesSampleGroups ? "Example: LECT-2024" : "Enter your group code"} autoComplete="off" />
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
    </ScreenShell>
  )
}

export function PendingScreen({
  data, progress, onBack, onApproved,
}: {
  data: FormData; progress: MinistryRequestProgress[]; onBack: () => void; onApproved: () => void
}) {
  return (
    <ScreenShell>
      <div className="flex flex-col items-center gap-7 mt-6">
        <ClockIcon />
        <JoinRequestOutcome
          progress={progress}
          fallbackName={data.groupName}
          onBack={onBack}
          onApproved={onApproved}
        />
      </div>
    </ScreenShell>
  )
}
