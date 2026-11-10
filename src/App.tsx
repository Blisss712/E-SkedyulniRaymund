import { useState, useEffect, useRef } from "react"
import { BACK_TARGETS, type Screen } from "./navigation"
import { useIsDesktop } from "./shared/ui"
import { applyStatusBar, listenForBackButton } from "./shared/native"
import { HomeScreen, type HomeTab, type Ministry } from "./shared/home"

// Wizard
import { WelcomeScreen, TellNameScreen, JoinGroupScreen, PendingScreen } from "./features/wizard/wizard"
import { DesktopJoinGroupScreen, DesktopPendingScreen } from "./features/wizard/desktop"
import { useWizard } from "./features/wizard/useWizard"

// Availability
import { AvailabilityTab, SetRecurringScreen, AddOverrideScreen } from "./features/availability/availability"
import { useAvailability } from "./features/availability/useAvailability"

// Open Slots
import { SlotList, SlotVolunteerScreen, SlotServingScreen, SlotFilledScreen } from "./features/slots/slots"
import { useSlots } from "./features/slots/useSlots"
import { AdminScreen } from "./features/admin/admin"
import { AdminLoginScreen } from "./features/admin/login"
import { useJoinRequests } from "./features/admin/useJoinRequests"
import { useMyMinistries } from "./features/organizations/useMyMinistries"
import { logoutAdmin } from "./features/admin/api"
import { AuthScreen } from "./features/auth/AuthScreen"
import { useAuth } from "./features/auth/AuthContext"
import { isPlaceholderName } from "./features/auth/types"
import {
  authRedirectFailureFromLocation,
  clearAuthRedirectFailure,
} from "./features/auth/redirect"
import { isSupabaseConfigured } from "./lib/supabase"

export default function App() {
  const { user, profile, loading, signOut, completeOnboarding } = useAuth()
  const isDesktop = useIsDesktop()
  const [screen, setScreen] = useState<Screen>("welcome")
  const [prevScreen, setPrevScreen] = useState<Screen>("welcome")
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin")
  // Why the last Google/Facebook attempt failed, when the provider sent the
  // browser back with an error instead of a session.
  const [authNotice, setAuthNotice] = useState("")
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [dashboardReturnScreen, setDashboardReturnScreen] = useState<"home" | "admin">("home")

  const [homeTab, setHomeTab] = useState<HomeTab>("availability")
  // The ministries belong to the signed-in member; the selection is just an id.
  // A request that is still waiting for approval is never the current ministry.
  const ministries = useMyMinistries()
  const [ministryId, setMinistryId] = useState("")
  const ministry: Ministry | null =
    ministries.items.find(item => item.id === ministryId && !item.waiting) ??
    ministries.items.find(item => !item.waiting) ??
    null

  const wizard = useWizard()
  const availability = useAvailability()
  const slots = useSlots()
  const joinRequests = useJoinRequests()
  const [activeRequestId, setActiveRequestId] = useState("")

  // Memberships and requests change while the member is away (an administrator
  // may approve a request), so re-read them whenever the dashboard opens.
  const refreshMinistriesRef = useRef(ministries.refresh)
  refreshMinistriesRef.current = ministries.refresh
  useEffect(() => {
    if (screen !== "home") return
    void refreshMinistriesRef.current()
  }, [screen])

  // The review queue is shared with members, so re-read it on every visit.
  const refreshJoinRequestsRef = useRef(joinRequests.refresh)
  refreshJoinRequestsRef.current = joinRequests.refresh
  useEffect(() => {
    if (!adminAuthenticated || screen !== "admin") return
    void refreshJoinRequestsRef.current()
  }, [adminAuthenticated, screen])

  useEffect(() => {
    if (screen !== "pending" || !activeRequestId || activeRequestId.startsWith("request-")) return
    const timer = window.setInterval(() => void joinRequests.refreshRequest(activeRequestId), 3000)
    return () => window.clearInterval(timer)
  }, [screen, activeRequestId])

  function go(to: Screen) {
    setPrevScreen(screen)
    setScreen(to)
  }

  function reset() {
    wizard.reset()
    setActiveRequestId("")
    setHomeTab("availability")
    setMinistryId("")
    availability.resetPosition()
    go("welcome")
  }

  /** Opens the account screen on the requested tab (sign in or create account). */
  function startAuth(tab: "signin" | "signup") {
    setAuthTab(tab)
    go("auth")
  }

  /** Copies the signed-in account name into the onboarding form when it is still empty. */
  function prefillName(fullName?: string) {
    if (!fullName || isPlaceholderName(fullName)) return
    if (wizard.firstName || wizard.lastName) return
    const parts = fullName.trim().split(/\s+/)
    wizard.setFirstName(parts[0] ?? "")
    wizard.setLastName(parts.slice(1).join(" "))
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
    applyStatusBar(screen)
  }, [screen])

  // Android back button support (only active inside the Android app).
  const screenRef = useRef(screen)
  screenRef.current = screen
  const prevScreenRef = useRef(prevScreen)
  prevScreenRef.current = prevScreen
  const dashboardReturnScreenRef = useRef(dashboardReturnScreen)
  dashboardReturnScreenRef.current = dashboardReturnScreen
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => listenForBackButton(BACK_TARGETS, () => screenRef.current, () => prevScreenRef.current, to => {
    const current = screenRef.current
    if (current === "set-recurring" || current === "add-override" || current.startsWith("slot-")) {
      goRef.current(dashboardReturnScreenRef.current)
      return
    }
    goRef.current(to)
  }), [])

  // Resume an existing session (the Supabase session now survives a page reload).
  // This runs at most once, and only while the welcome screen is still showing.
  const resumedSessionRef = useRef(false)
  useEffect(() => {
    if (resumedSessionRef.current || loading || !user || !profile) return
    resumedSessionRef.current = true
    if (screenRef.current !== "welcome") return
    prefillName(profile.fullName)
    if (profile.role === "admin") {
      setAdminAuthenticated(true)
      setScreen("admin")
      return
    }
    // A brand-new account — including one that returns from Google or Facebook
    // with its name already filled in — still needs the setup wizard.
    if (!profile.onboarded) {
      setScreen("tell-name")
      return
    }
    setScreen("home")
  }, [loading, user, profile])

  /**
   * A refused Google/Facebook login comes back as `?error=access_denied...` in
   * the address bar with no session. Read it once, then strip it so a refresh
   * does not repeat the message.
   */
  useEffect(() => {
    const failure = authRedirectFailureFromLocation()
    if (!failure) return
    setAuthNotice(failure.message)
    clearAuthRedirectFailure()
  }, [])

  // Send the member back to the sign-in form with the reason, rather than
  // leaving them on the welcome screen as if the social login never ran.
  useEffect(() => {
    if (loading || !authNotice || user) return
    if (screenRef.current !== "welcome") return
    setAuthTab("signin")
    setScreen("auth")
  }, [loading, authNotice, user])

  function renderMemberDashboard(embedded = false) {
    return (
      <HomeScreen
        userName={wizard.form.name || profile?.fullName || "Maria Santos"}
        ministries={ministries.items}
        ministry={ministry}
        onMinistryChange={next => setMinistryId(next.id)}
        tab={homeTab}
        onTabChange={setHomeTab}
        onJoin={() => go("join-group")}
        onLogout={() => {
          void signOut()
          reset()
        }}
        embedded={embedded}
      >
        {homeTab === "availability" ? (
          <AvailabilityTab
            recurringEntries={availability.recurringEntries}
            overrides={availability.overrides}
            slots={slots.slots}
            error={availability.error}
            scheduledEvents={[]}
            onViewSlot={slot => {
              slots.setActiveSlot(slot)
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go("slot-serving")
            }}
            position={availability.timetablePosition}
            onPositionChange={availability.changePosition}
            onAddRecurring={() => { availability.startRecurring(); setDashboardReturnScreen(embedded ? "admin" : "home"); go("set-recurring") }}
            onAddOverride={() => { availability.startOverride(); setDashboardReturnScreen(embedded ? "admin" : "home"); go("add-override") }}
            onEditRecurring={e => { availability.startRecurring(e); setDashboardReturnScreen(embedded ? "admin" : "home"); go("set-recurring") }}
            onEditOverride={e => { availability.startOverride(e); setDashboardReturnScreen(embedded ? "admin" : "home"); go("add-override") }}
            onRemoveRecurring={availability.removeRecurring}
            onRemoveOverride={availability.removeOverride}
          />
        ) : (
          <SlotList
            slots={slots.slots}
            onSlotTap={slot => {
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go(slots.openSlot(slot))
            }}
          />
        )}
      </HomeScreen>
    )
  }

  switch (screen) {
    // ─── Wizard ───────────────────────────────────────────────────────────────
    case "welcome":
      return (
        <WelcomeScreen
          accountsEnabled={isSupabaseConfigured}
          onStart={() => {
            if (isSupabaseConfigured && !user) startAuth("signup")
            else go("tell-name")
          }}
          onSignIn={() => startAuth("signin")}
          onAdmin={() => go("admin-login")}
        />
      )

    case "auth":
      return (
        <AuthScreen
          defaultTab={authTab}
          notice={authNotice}
          onBack={() => {
            setAuthNotice("")
            go("welcome")
          }}
          onAdmin={() => {
            setAuthNotice("")
            go("admin-login")
          }}
          onSkip={() => go("tell-name")}
          onSuccess={(signedInProfile, mode) => {
            setAuthNotice("")
            if (signedInProfile?.role === "admin") {
              setAdminAuthenticated(true)
              go("admin")
              return
            }
            // New accounts (email, phone, Google, Facebook) confirm their name
            // and enter a group code; only finished accounts go to the dashboard.
            if (mode === "signup" || !signedInProfile?.onboarded) {
              prefillName(signedInProfile?.fullName)
              go("tell-name")
              return
            }
            go("home")
          }}
        />
      )

    case "admin-login":
      return (
        <AdminLoginScreen
          onBack={() => go("welcome")}
          onAuthenticated={() => {
            setAdminAuthenticated(true)
            go("admin")
          }}
        />
      )

    case "admin":
      return adminAuthenticated ? (
        <AdminScreen
          adminName={profile?.fullName}
          requests={joinRequests.requests}
          requestError={joinRequests.apiError}
          onApproveRequest={joinRequests.approveRequest}
          onRejectRequest={joinRequests.rejectRequest}
          onLogout={() => {
            setAdminAuthenticated(false)
            void logoutAdmin()
            // An administrator who signed in through Supabase also holds a
            // Supabase session; end it so a reload does not reopen the workspace.
            void signOut()
            go("welcome")
          }}
        />
      ) : (
        <AdminLoginScreen
          onBack={() => go("welcome")}
          onAuthenticated={() => {
            setAdminAuthenticated(true)
            go("admin")
          }}
        />
      )

    case "tell-name":
      return (
        <TellNameScreen
          firstName={wizard.firstName}
          lastName={wizard.lastName}
          setFirstName={wizard.setFirstName}
          setLastName={wizard.setLastName}
          onContinue={() => {
            // Persist the confirmed name right away: the dashboard, join
            // requests, and the next sign-in all read it from the profile.
            void completeOnboarding(`${wizard.firstName} ${wizard.lastName}`.trim())
            wizard.saveName()
            go("join-group")
          }}
        />
      )

    case "join-group": {
      // Back returns to wherever the member came from: name entry during onboarding, or Home via "+ Join Another Ministry".
      const back = () => go(prevScreen)
      const submitJoinRequest = async (group: { groupCode: string; groupName: string; organizationId?: string }) => {
        const requestId = await joinRequests.createRequest({
            memberName: wizard.form.name || profile?.fullName || "Member",
            groupCode: group.groupCode,
            groupName: group.groupName,
            organizationId: group.organizationId,
        })
        setActiveRequestId(requestId)
        // The request is now pending, so the dashboard's ministry list changes.
        void ministries.refresh()
        go("pending")
      }
      return isDesktop ? (
        <DesktopJoinGroupScreen data={wizard.form} setData={wizard.updateForm} onJoin={submitJoinRequest} onBack={back} />
      ) : (
        <JoinGroupScreen data={wizard.form} setData={wizard.updateForm} onJoin={submitJoinRequest} onBack={back} />
      )
    }

    case "pending":
      return isDesktop ? (
        <DesktopPendingScreen data={wizard.form} status={joinRequests.requests.find(request => request.id === activeRequestId)?.status ?? "pending"} onBack={reset} onApproved={() => go("home")} />
      ) : (
        <PendingScreen data={wizard.form} status={joinRequests.requests.find(request => request.id === activeRequestId)?.status ?? "pending"} onBack={reset} onApproved={() => go("home")} />
      )

    // ─── Home (holds the Availability and Open Slots tabs) ────────────────────
    case "home":
      return renderMemberDashboard()

    // ─── Availability ─────────────────────────────────────────────────────────
    case "set-recurring":
      return (
        <SetRecurringScreen
          initial={availability.editingRecurring}
          onSave={async entry => {
            const result = await availability.saveRecurring(entry)
            if (result.ok) go(dashboardReturnScreen)
            return result
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      )

    case "add-override":
      return (
        <AddOverrideScreen
          initial={availability.editingOverride}
          onSave={async entry => {
            const result = await availability.saveOverride(entry)
            if (result.ok) go(dashboardReturnScreen)
            return result
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      )

    // ─── Open Slots ───────────────────────────────────────────────────────────
    case "slot-volunteer":
      return slots.activeSlot ? (
        <SlotVolunteerScreen
          slot={slots.activeSlot}
          error={slots.error}
          onVolunteer={() => {
            void slots.volunteer().then(result => {
              if (result.ok) go("slot-serving")
            })
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      ) : null

    case "slot-serving":
      return slots.activeSlot ? (
        <SlotServingScreen
          slot={slots.activeSlot}
          error={slots.error}
          onCancelSpot={() => {
            void slots.cancelSpot().then(result => {
              if (result.ok) go(dashboardReturnScreen)
            })
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      ) : null

    case "slot-filled":
      return <SlotFilledScreen onSeeOthers={() => go(dashboardReturnScreen)} />
  }
}
