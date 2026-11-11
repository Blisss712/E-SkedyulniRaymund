import type { BackTarget } from "../../shared/native"

export type MessagingScreen = "chat"

// Where the Android back button goes from each Messaging screen. The chat screen
// can also be opened from the admin workspace; App decides that return target.
export const MESSAGING_BACK_TARGETS: Record<MessagingScreen, BackTarget<"home">> =
  {
    chat: "home",
  }
