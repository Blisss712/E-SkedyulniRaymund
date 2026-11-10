import type { BackTarget } from "../../shared/native"

export type AvailabilityScreen = "set-recurring" | "add-override"

// Where the Android back button goes from each Availability screen.

export const AVAILABILITY_BACK_TARGETS: Record<AvailabilityScreen, BackTarget<"home">> =
  {
    "set-recurring": "home",

    "add-override": "home",
  }
