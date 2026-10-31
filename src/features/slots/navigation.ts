import type { BackTarget } from "../../shared/native"

export type SlotsScreen = "slot-volunteer" | "slot-serving" | "slot-filled"

// Where the Android back button goes from each Open Slots screen.

export const SLOTS_BACK_TARGETS: Record<SlotsScreen, BackTarget<"home">> = {
  "slot-volunteer": "home",

  "slot-serving": "home",

  "slot-filled": "home",
}
