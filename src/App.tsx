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

export default function App() {
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
        embedded={embedded}
      >
        {homeTab === "availability" ? (
          <AvailabilityTab
            recurringEntries={availability.recurringEntries}
            overrides={availability.overrides}
            slots={slots.slots}
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
      return <WelcomeScreen onStart={() => go("tell-name")} onAdmin={() => go("admin-login")} />

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
      return isDesktop ? (
        <DesktopJoinGroupScreen data={wizard.form} setData={wizard.updateForm} onJoin={() => {
          setActiveRequestId(joinRequests.createRequest({
            memberName: wizard.form.name || "Member",
            groupCode: wizard.form.groupCode,
            groupName: wizard.form.groupName,
          }))
          go("pending")
        }} onBack={back} />
      ) : (
        <JoinGroupScreen data={wizard.form} setData={wizard.updateForm} onJoin={() => {
          setActiveRequestId(joinRequests.createRequest({
            memberName: wizard.form.name || "Member",
            groupCode: wizard.form.groupCode,
            groupName: wizard.form.groupName,
          }))
          go("pending")
        }} onBack={back} />
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
          onSave={entry => { availability.saveRecurring(entry); go(dashboardReturnScreen) }}
          onBack={() => go(dashboardReturnScreen)}
        />
      )

    case "add-override":
      return (
        <AddOverrideScreen
          initial={availability.editingOverride}
          onSave={entry => { availability.saveOverride(entry); go(dashboardReturnScreen) }}
          onBack={() => go(dashboardReturnScreen)}
        />
      )

    // ─── Open Slots ───────────────────────────────────────────────────────────
    case "slot-volunteer":
      return slots.activeSlot ? (
        <SlotVolunteerScreen
          slot={slots.activeSlot}
          onVolunteer={() => { slots.volunteer(); go("slot-serving") }}
          onBack={() => go(dashboardReturnScreen)}
        />
      ) : null

    case "slot-serving":
      return slots.activeSlot ? (
        <SlotServingScreen
          slot={slots.activeSlot}
          onCancelSpot={() => { slots.cancelSpot(); go(dashboardReturnScreen) }}
          onBack={() => go(dashboardReturnScreen)}
        />
      ) : null

    case "slot-filled":
      return <SlotFilledScreen onSeeOthers={() => go(dashboardReturnScreen)} />
  }
}
