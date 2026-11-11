import type { BackTarget } from "./shared/native"
import {
  WIZARD_BACK_TARGETS,
  type WizardScreen,
} from "./features/wizard/navigation"
import {
  AVAILABILITY_BACK_TARGETS,
  type AvailabilityScreen,
} from "./features/availability/navigation"
import {
  SLOTS_BACK_TARGETS,
  type SlotsScreen,
} from "./features/slots/navigation"
import {
  MESSAGING_BACK_TARGETS,
  type MessagingScreen,
} from "./features/messaging/navigation"

// Every screen in the app. Each feature lists its own screens in its navigation.ts.
export type Screen =
  | WizardScreen
  | "auth"
  | "forgot-password"
  | "home"
  | "admin-login"
  | "coordinator-login"
  | "admin"
  | AvailabilityScreen
  | SlotsScreen
  | MessagingScreen

// Where the Android back button goes from each screen.
export const BACK_TARGETS: Record<Screen, BackTarget<Screen>> = {
  ...WIZARD_BACK_TARGETS,
  auth: "welcome",
  "forgot-password": "auth",
  home: "minimize",
  "admin-login": "welcome",
  "coordinator-login": "welcome",
  admin: "admin-login",
  ...AVAILABILITY_BACK_TARGETS,
  ...SLOTS_BACK_TARGETS,
  ...MESSAGING_BACK_TARGETS,
}
