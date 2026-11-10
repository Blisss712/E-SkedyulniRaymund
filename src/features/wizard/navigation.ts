import type { BackTarget } from "../../shared/native"

export type WizardScreen = "welcome" | "tell-name" | "join-group" | "pending"

// Where the Android back button goes from each Wizard screen.

export const WIZARD_BACK_TARGETS: Record<WizardScreen, BackTarget<WizardScreen>> =
  {
    welcome: "exit",

    "tell-name": "welcome",

    "join-group": "previous",

    pending: "welcome",
  }
