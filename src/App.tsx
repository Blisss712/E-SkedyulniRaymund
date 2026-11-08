import { useState, useEffect, useRef } from "react"
import { BACK_TARGETS, type Screen } from "./navigation"
import { useIsDesktop } from "./shared/ui"
import { applyStatusBar, listenForBackButton } from "./shared/native"
import { HomeScreen, MINISTRIES, type HomeTab } from "./shared/home"

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
import { logoutAdmin } from "./features/admin/api"
import { AuthScreen } from "./features/auth/AuthScreen"
import { useAuth } from "./features/auth/AuthContext"
import { isSupabaseConfigured } from "./lib/supabase"

export default function App() {
  const { user, signOut } = useAuth()
  const isDesktop = useIsDesktop()
  const [screen, setScreen] = useState<Screen>("welcome")
  const [prevScreen, setPrevScreen] = useState<Screen>("welcome")
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [dashboardReturnScreen, setDashboardReturnScreen] = useState<"home" | "admin">("home")

  const [homeTab, setHomeTab] = useState<HomeTab>("availability")
  const [ministry, setMinistry] = useState(MINISTRIES[0])

  const wizard = useWizard()
  const availability = useAvailability()
  const slots = useSlots()
  const joinRequests = useJoinRequests()
  const [activeRequestId, setActiveRequestId] = useState("")

  useEffect(() => {
    if (adminAuthenticated) void joinRequests.refresh()
  }, [adminAuthenticated])

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
    setMinistry(MINISTRIES[0])
    availability.resetPosition()
    go("welcome")
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

  function renderMemberDashboard(embedded = false) {
    return (
      <HomeScreen
        userName={wizard.form.name || "Maria Santos"}
        ministry={ministry}
        onMinistryChange={setMinistry}
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
          onStart={() => go(isSupabaseConfigured && !user ? "auth" : "tell-name")}
          onAdmin={() => go("admin-login")}
        />
      )

    case "auth":
      return (
        <AuthScreen
          onBack={() => go("welcome")}
          onAdmin={() => go("admin-login")}
          onSuccess={profile => {
            if (profile?.role === "admin") {
              setAdminAuthenticated(true)
              go("admin")
            } else {
              go("tell-name")
            }
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
          requests={joinRequests.requests}
          requestError={joinRequests.apiError}
          onApproveRequest={joinRequests.approveRequest}
          onRejectRequest={joinRequests.rejectRequest}
          onLogout={() => {
            setAdminAuthenticated(false)
            void logoutAdmin()
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
            wizard.saveName()
            go("join-group")
          }}
        />
      )

    case "join-group": {
      // Back returns to wherever the member came from: name entry during onboarding, or Home via "+ Join Another Ministry".
      const back = () => go(prevScreen)
      const submitJoinRequest = async (group: { groupCode: string; groupName: string }) => {
        const requestId = await joinRequests.createRequest({
            memberName: wizard.form.name || "Member",
            groupCode: group.groupCode,
            groupName: group.groupName,
        })
        setActiveRequestId(requestId)
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
