import { useState, useEffect, useRef } from "react"
import { BACK_TARGETS, type Screen } from "./navigation"
import { useIsDesktop } from "./shared/ui"
import { applyStatusBar, listenForBackButton } from "./shared/native"
import { HomeScreen, type HomeTab, type Ministry } from "./shared/home"

// Wizard
import { WelcomeScreen, TellNameScreen, JoinGroupScreen, PendingScreen } from "./features/wizard/wizard"
import { DesktopJoinGroupScreen, DesktopPendingScreen } from "./features/wizard/desktop"
import { useWizard } from "./features/wizard/useWizard"
import type { JoinTarget } from "./features/wizard/types"
import type { MinistryRequestProgress } from "./features/wizard/requestAccess"

// Availability
import { AvailabilityTab, SetRecurringScreen, AddOverrideScreen } from "./features/availability/availability"
import { useAvailability } from "./features/availability/useAvailability"

// Open Slots
import { SlotList, SlotVolunteerScreen, SlotServingScreen, SlotFilledScreen } from "./features/slots/slots"
import { useSlots } from "./features/slots/useSlots"
import { AdminScreen } from "./features/admin/admin"
import { AdminLoginScreen } from "./features/admin/login"
import { CoordinatorLoginScreen } from "./features/admin/coordinatorLogin"
import { useJoinRequests } from "./features/admin/useJoinRequests"
import { useMyMinistries } from "./features/organizations/useMyMinistries"
import { logoutAdmin, getAdminToken } from "./features/admin/api"
import { AuthScreen } from "./features/auth/AuthScreen"
import { useAuth } from "./features/auth/AuthContext"
import { isPlaceholderName } from "./features/auth/types"
import {
  authRedirectFailureFromLocation,
  clearAuthRedirectFailure,
} from "./features/auth/redirect"
import { isSupabaseConfigured } from "./lib/supabase"

export default function App() {
  const { user, profile, loading, signOut, completeOnboarding, refreshProfile } = useAuth()
  const isDesktop = useIsDesktop()
  const [screen, setScreen] = useState<Screen>("welcome")
  const [prevScreen, setPrevScreen] = useState<Screen>("welcome")
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin")
  // Why the last Google/Facebook attempt failed, when the provider sent the
  // browser back with an error instead of a session.
  const [authNotice, setAuthNotice] = useState("")
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [dashboardReturnScreen, setDashboardReturnScreen] = useState<"home" | "admin">("home")

  /** The signed-in account's workspace role; coordinator access is appointment-based. */
  const workspaceRole = profile?.role === "leader" ? "leader" : "admin"
  const isCoordinator = profile?.role === "leader"

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
  /** One id per ministry the member just asked to join, in the order sent. */
  const [activeRequestIds, setActiveRequestIds] = useState<string[]>([])

  // Memberships and requests change while the member is away (an administrator
  // may approve a request), so re-read them whenever the dashboard opens.
  const refreshMinistriesRef = useRef(ministries.refresh)
  refreshMinistriesRef.current = ministries.refresh
  useEffect(() => {
    if (screen !== "home") return
    void refreshMinistriesRef.current()
  }, [screen])

  // An administrator can appoint (or remove) this account as a coordinator while
  // it is signed in, so the dashboard re-reads the role and appointments too.
  const refreshProfileRef = useRef(refreshProfile)
  refreshProfileRef.current = refreshProfile
  useEffect(() => {
    if (screen !== "home") return
    void refreshProfileRef.current()
  }, [screen])

  // The review queue is shared with members, so re-read it on every visit.
  const refreshJoinRequestsRef = useRef(joinRequests.refresh)
  refreshJoinRequestsRef.current = joinRequests.refresh
  useEffect(() => {
    if (!adminAuthenticated || screen !== "admin") return
    // Coordinators do not review join requests; that stays administrator-only.
    if (profile?.role !== "admin") return
    void refreshJoinRequestsRef.current()
  }, [adminAuthenticated, screen, profile?.role])

  useEffect(() => {
    if (screen !== "pending") return
    // `request-` ids only exist in this browser's offline copy.
    const ids = activeRequestIds.filter(id => !id.startsWith("request-"))
    if (ids.length === 0) return
    const timer = window.setInterval(() => {
      ids.forEach(id => void joinRequests.refreshRequest(id))
    }, 3000)
    return () => window.clearInterval(timer)
  }, [screen, activeRequestIds])

  function go(to: Screen) {
    setPrevScreen(screen)
    setScreen(to)
  }

  function reset() {
    wizard.reset()
    setActiveRequestIds([])
    setHomeTab("availability")
    setMinistryId("")
    availability.resetPosition()
    go("welcome")
  }

  /**
   * Opens the workspace after the sign-in screen already verified the account.
   * The screen itself is role-aware: an administrator gets every section, a
   * coordinator only their own ministries and events.
   */
  function enterWorkspace() {
    setAdminAuthenticated(true)
    go("admin")
  }

  /**
   * Opens the workspace from the member dashboard. The profile is re-read first
   * because an administrator may have appointed (or removed) this coordinator
   * while the member was already signed in.
   */
  async function openWorkspace() {
    const fresh = await refreshProfile()
    const role = fresh?.role ?? profile?.role
    if (role !== "admin" && role !== "leader") {
      go("home")
      return
    }
    enterWorkspace()
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
  const isCoordinatorRef = useRef(isCoordinator)
  isCoordinatorRef.current = isCoordinator
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => listenForBackButton(BACK_TARGETS, () => screenRef.current, () => prevScreenRef.current, to => {
    const current = screenRef.current
    if (current === "set-recurring" || current === "add-override" || current.startsWith("slot-")) {
      goRef.current(dashboardReturnScreenRef.current)
      return
    }
    // A coordinator's workspace is entered from their member dashboard, not
    // from the administrator sign-in screen.
    if (current === "admin" && isCoordinatorRef.current) {
      goRef.current("home")
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
        isAdmin={profile?.role === "admin"}
        onAdmin={openWorkspace}
        isLeader={profile?.role === "leader"}
        onLeader={openWorkspace}
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
          onCoordinator={() => go("coordinator-login")}
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
          onCoordinator={() => {
            setAuthNotice("")
            go("coordinator-login")
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
          onAuthenticated={() => enterWorkspace()}
          onCoordinator={() => go("coordinator-login")}
        />
      )

    case "coordinator-login":
      return (
        <CoordinatorLoginScreen
          onBack={() => go("welcome")}
          onAuthenticated={() => enterWorkspace()}
          onAdmin={() => go("admin-login")}
        />
      )

    case "admin":
      // A member who is not (or is no longer) an administrator or coordinator
      // never sees a workspace: RLS would refuse the data, and the account has
      // no reason to be here. An administrator signed in through the optional
      // FastAPI backend holds that token instead of a workspace role.
      if (profile?.role === "member" && !getAdminToken()) {
        return renderMemberDashboard()
      }
      return adminAuthenticated ? (
        <AdminScreen
          adminName={profile?.fullName}
          requests={joinRequests.requests}
          requestError={joinRequests.apiError}
          onApproveRequest={joinRequests.approveRequest}
          onRejectRequest={joinRequests.rejectRequest}
          role={workspaceRole}
          leaderOrganizationIds={profile?.leaderOrganizations.map(ministry => ministry.id) ?? []}
          logoutLabel={isCoordinator ? "My member dashboard" : "Sign out"}
          onLogout={() => {
            setAdminAuthenticated(false)
            // A coordinator is a member first: leaving the workspace returns to
            // their schedule instead of ending the session.
            if (isCoordinator) {
              go("home")
              return
            }
            void logoutAdmin()
            // An administrator who signed in through Supabase also holds a
            // Supabase session; end it so a reload does not reopen the workspace.
            void signOut()
            go("welcome")
          }}
        />
      ) : profile?.role === "leader" ? (
        <CoordinatorLoginScreen
          onBack={() => go("welcome")}
          onAuthenticated={() => enterWorkspace()}
          onAdmin={() => go("admin-login")}
        />
      ) : (
        <AdminLoginScreen
          onBack={() => go("welcome")}
          onAuthenticated={() => enterWorkspace()}
          onCoordinator={() => go("coordinator-login")}
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
      const memberName = wizard.form.name || profile?.fullName || "Member"
      /**
       * Each ticked ministry needs its own join request, because a request
       * belongs to one organization. They are sent together so the member
       * reaches one pending screen for the whole batch.
       */
      const submitJoinRequests = async (groups: JoinTarget[]) => {
        const requestIds = await Promise.all(groups.map(group =>
          joinRequests.createRequest({
            memberName,
            groupCode: group.groupCode,
            groupName: group.groupName,
            organizationId: group.organizationId,
          }),
        ))
        setActiveRequestIds(requestIds)
        // The requests are now pending, so the dashboard's ministry list changes.
        void ministries.refresh()
        go("pending")
      }
      return isDesktop ? (
        <DesktopJoinGroupScreen data={wizard.form} setData={wizard.updateForm} onJoin={submitJoinRequests} onBack={back} />
      ) : (
        <JoinGroupScreen data={wizard.form} setData={wizard.updateForm} onJoin={submitJoinRequests} onBack={back} />
      )
    }

    case "pending": {
      const progress: MinistryRequestProgress[] = activeRequestIds.map((id, index) => ({
        name: wizard.form.groupNames?.[index] ?? wizard.form.groupName,
        status: joinRequests.requests.find(request => request.id === id)?.status ?? "pending",
      }))
      return isDesktop ? (
        <DesktopPendingScreen data={wizard.form} progress={progress} onBack={reset} onApproved={() => go("home")} />
      ) : (
        <PendingScreen data={wizard.form} progress={progress} onBack={reset} onApproved={() => go("home")} />
      )
    }

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
