import type { OneTimeOverride, RecurringAvail } from "../availability/types"

import type { Slot } from "../../shared/slot"

export type AssistantIntent = "availability" | "slot_search" | "unknown"

export type AssistantFacts = {
  recurringAvailability: RecurringAvail[]

  overrides: OneTimeOverride[]

  slots: Slot[]
}

export type ScheduleAssistantRequest = {
  version: 1

  question: string

  intentHint: AssistantIntent

  facts: AssistantFacts

  deterministicAnswer: string
}

export type ScheduleAssistantResponse = {
  version: 1

  answer: string

  intent: AssistantIntent

  source: "llm" | "deterministic"

  referencedSlotIds: string[]
}
