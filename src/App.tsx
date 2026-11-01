import { useState, useEffect, useRef } from "react"
import { BACK_TARGETS, type Screen } from "./navigation"
import { useIsDesktop } from "./shared/ui"
import { applyStatusBar, listenForBackButton } from "./shared/native"
import { HomeScreen, MINISTRIES, type HomeTab } from "./shared/home"

// Auth
import { AuthProvider, useAuth } from "./features/auth/AuthContext"
import { AuthScreen } from "./features/auth/AuthScreen"

// Wizard
import {
  WelcomeScreen,
  TellNameScreen,
  JoinGroupScreen,
  PendingScreen,
} from "./features/wizard/wizard"
import {
  DesktopJoinGroupScreen,
  DesktopPendingScreen,
} from "./features/wizard/desktop"
import { useWizard } from "./features/wizard/useWizard"

// Availability
import {
  AvailabilityTab,
  SetRecurringScreen,
  AddOverrideScreen,
} from "./features/availability/availability"
import { useAvailability } from "./features/availability/useAvailability"

// Open Slots
import {
  SlotList,
  SlotVolunteerScreen,
  SlotServingScreen,
  SlotFilledScreen,
} from "./features/slots/slots"
import { useSlots } from "./features/slots/useSlots"
import { AdminScreen } from "./features/admin/admin"
import { AdminLoginScreen } from "./features/admin/login"
import type { AdminEvent } from "./features/admin/types"
import { isSupabaseConfigured, supabase } from "./lib/supabase"

function AppContent() {
  const isDesktop = useIsDesktop()
  const { profile, user, isAdmin, signOut } = useAuth()

  const [screen, setScreen] = useState<Screen>("welcome")
  const [prevScreen, setPrevScreen] = useState<Screen>("welcome")
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [dashboardReturnScreen, setDashboardReturnScreen] =
    useState<"home" | "admin">("home")

  const [homeTab, setHomeTab] = useState<HomeTab>("availability")
  const [ministry, setMinistry] = useState(MINISTRIES[0])

  const wizard = useWizard()
  const availability = useAvailability()
  const slots = useSlots()
  const [publishedEvents, setPublishedEvents] = useState<AdminEvent[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let active = true
    supabase
      .from("events")
      .select(
        "id, organization_id, title, description, starts_at, ends_at, location, capacity, registration_deadline, visibility, recurrence, repeat_until, status, created_at",
      )
      .eq("status", "published")
      .then(({ data, error }) => {
        if (!active || error) return
        setPublishedEvents(
          (data ?? []).map((row) => ({
            id: row.id,
            organizationId: row.organization_id,
            title: row.title,
            description: row.description,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            location: row.location,
            capacity: row.capacity,
            registrationDeadline: row.registration_deadline ?? "",
            visibility: row.visibility,
            recurrence: row.recurrence,
            repeatUntil: row.repeat_until?.slice(0, 10) ?? "",
            status: row.status,
            createdAt: row.created_at,
          })),
        )
      })

    return () => {
      active = false
    }
  }, [profile?.id])

  function go(to: Screen) {
    setPrevScreen(screen)
    setScreen(to)
  }

  function reset() {
    signOut()
    wizard.reset()
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

  useEffect(
    () =>
      listenForBackButton(
        BACK_TARGETS,
        () => screenRef.current,
        () => prevScreenRef.current,
        (to) => {
          const current = screenRef.current
          if (
            current === "set-recurring" ||
            current === "add-override" ||
            current.startsWith("slot-")
          ) {
            goRef.current(dashboardReturnScreenRef.current)
            return
          }
          goRef.current(to)
        },
      ),
    [],
  )

  const activeUserName =
    profile?.fullName ||
    wizard.form.name ||
    (user?.email ? user.email.split("@")[0] : "Maria Santos")

  function renderMemberDashboard(embedded = false) {
    return (
      <HomeScreen
        userName={activeUserName}
        ministry={ministry}
        onMinistryChange={setMinistry}
        tab={homeTab}
        onTabChange={setHomeTab}
        onJoin={() => go("join-group")}
        onLogout={reset}
        embedded={embedded}
        isAdmin={isAdmin || adminAuthenticated}
        onAdmin={() => go("admin")}
      >
        {homeTab === "availability" ? (
          <AvailabilityTab
            recurringEntries={availability.recurringEntries}
            overrides={availability.overrides}
            slots={slots.slots}
            scheduledEvents={publishedEvents}
            onViewSlot={(slot) => {
              slots.setActiveSlot(slot)
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go("slot-serving")
            }}
            position={availability.timetablePosition}
            onPositionChange={availability.changePosition}
            onAddRecurring={() => {
              availability.startRecurring()
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go("set-recurring")
            }}
            onAddOverride={() => {
              availability.startOverride()
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go("add-override")
            }}
            onEditRecurring={(e) => {
              availability.startRecurring(e)
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go("set-recurring")
            }}
            onEditOverride={(e) => {
              availability.startOverride(e)
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go("add-override")
            }}
            onRemoveRecurring={availability.removeRecurring}
            onRemoveOverride={availability.removeOverride}
          />
        ) : (
          <SlotList
            slots={slots.slots}
            onSlotTap={(slot) => {
              setDashboardReturnScreen(embedded ? "admin" : "home")
              go(slots.openSlot(slot))
            }}
          />
        )}
      </HomeScreen>
    )
  }

  const hasAdminAccess = adminAuthenticated || isAdmin

  switch (screen) {
    // ─── Welcome & Auth ───────────────────────────────────────────────────────
    case "welcome":
      return (
        <WelcomeScreen
          onStart={() => go("tell-name")}
          onAuth={() => go("auth")}
          onAdmin={() => go("admin-login")}
          currentUserName={
            profile?.fullName || (user?.email ? user.email.split("@")[0] : null)
          }
          isAdmin={isAdmin || adminAuthenticated}
          onContinueAsUser={() =>
            isAdmin || adminAuthenticated ? go("admin") : go("home")
          }
          onOpenAdmin={() => go("admin")}
        />
      )

    case "auth":
      return (
        <AuthScreen
          onSuccess={(loggedProfile) => {
            if (loggedProfile?.role === "admin" || isAdmin) {
              setAdminAuthenticated(true)
              go("admin")
            } else {
              go("home")
            }
          }}
          onAdmin={() => go("admin-login")}
          onBack={() => go("welcome")}
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
      return hasAdminAccess ? (
        <AdminScreen
          adminName={
            profile?.fullName ||
            (user?.email ? user.email.split("@")[0] : "Administrator")
          }
          adminEmail={profile?.email || user?.email || "admin@eskedyul.local"}
          memberDashboard={renderMemberDashboard(true)}
          onSwitchToMember={() => go("home")}
          onLogout={() => {
            setAdminAuthenticated(false)
            reset()
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
            go("home")
          }}
        />
      )


    case "join-group": {
      const back = () => go(prevScreen)
      return isDesktop ? (
        <DesktopJoinGroupScreen
          data={wizard.form}
          setData={wizard.updateForm}
          onJoin={() => go("pending")}
          onBack={back}
        />
      ) : (
        <JoinGroupScreen
          data={wizard.form}
          setData={wizard.updateForm}
          onJoin={() => go("pending")}
          onBack={back}
        />
      )
    }

    case "pending":
      return isDesktop ? (
        <DesktopPendingScreen
          data={wizard.form}
          onBack={reset}
          onApproved={() => go("home")}
        />
      ) : (
        <PendingScreen
          data={wizard.form}
          onBack={reset}
          onApproved={() => go("home")}
        />
      )

    // ─── Home (holds the Availability and Open Slots tabs) ────────────────────
    case "home":
      return renderMemberDashboard()

    // ─── Availability ─────────────────────────────────────────────────────────
    case "set-recurring":
      return (
        <SetRecurringScreen
          initial={availability.editingRecurring}
          onSave={(entry) => {
            availability.saveRecurring(entry)
            go(dashboardReturnScreen)
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      )

    case "add-override":
      return (
        <AddOverrideScreen
          initial={availability.editingOverride}
          onSave={(entry) => {
            availability.saveOverride(entry)
            go(dashboardReturnScreen)
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      )

    // ─── Open Slots ───────────────────────────────────────────────────────────
    case "slot-volunteer":
      return slots.activeSlot ? (
        <SlotVolunteerScreen
          slot={slots.activeSlot}
          onVolunteer={() => {
            slots.volunteer()
            go("slot-serving")
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      ) : null

    case "slot-serving":
      return slots.activeSlot ? (
        <SlotServingScreen
          slot={slots.activeSlot}
          onCancelSpot={() => {
            slots.cancelSpot()
            go(dashboardReturnScreen)
          }}
          onBack={() => go(dashboardReturnScreen)}
        />
      ) : null

    case "slot-filled":
      return <SlotFilledScreen onSeeOthers={() => go(dashboardReturnScreen)} />
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
