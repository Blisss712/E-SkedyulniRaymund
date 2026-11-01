import { isSupabaseConfigured, supabase } from "../../lib/supabase"

import type { OneTimeOverride, RecurringAvail } from "../availability/types"

import type { Slot } from "../../shared/slot"

import type {
  AssistantFacts,
  AssistantIntent,
  ScheduleAssistantRequest,
  ScheduleAssistantResponse,
} from "./types"

function inferIntent(question: string): AssistantIntent {
  const normalized = question.toLowerCase()

  if (
    /\b(slot|appointment|schedule|sir|teacher|raymund|meeting)\b/.test(
      normalized,
    )
  ) {
    return "slot_search"
  }

  if (/\b(free|available|availability|time|when)\b/.test(normalized)) {
    return "availability"
  }

  return "unknown"
}

function formatAvailability(
  recurringAvailability: RecurringAvail[],

  overrides: OneTimeOverride[],
) {
  const recurring = recurringAvailability.map(
    (entry) => `${entry.days.join(", ")} ${entry.startTime}-${entry.endTime}`,
  )

  const changes = overrides.map((entry) =>
    entry.type === "blocked"
      ? `${entry.date}: unavailable all day`
      : `${entry.date}: free ${entry.startTime}-${entry.endTime}`,
  )

  if (recurring.length === 0 && changes.length === 0) {
    return "You have not added any availability yet. Add a weekly schedule or a date-specific override first."
  }

  const lines = [
    recurring.length > 0
      ? `Your regular availability is ${recurring.join("; ")}.`
      : "You have no regular weekly availability saved.",

    changes.length > 0 ? `Date-specific changes: ${changes.join("; ")}.` : "",
  ].filter(Boolean)

  return lines.join(" ")
}

function formatSlotSearch(question: string, slots: Slot[]) {
  const openSlots = slots.filter(
    (slot) => slot.status === "open" && slot.withinCutoff !== false,
  )

  const mentionsRaymund = /\braymund\b/i.test(question)

  if (openSlots.length === 0) {
    return mentionsRaymund
      ? "There are no open slots in the current schedule. The schedule data also does not include a teacher or facilitator field, so I cannot verify a slot specifically with Sir Raymund."
      : "There are no open slots in the current schedule."
  }

  const summary = openSlots

    .map(
      (slot) =>
        `${slot.date} at ${slot.time} (${slot.massName}, ${slot.totalSpots - slot.filledSpots} spot${
          slot.totalSpots - slot.filledSpots === 1 ? "" : "s"
        } left)`,
    )

    .join("; ")

  return mentionsRaymund
    ? `Open slots are ${summary}. The schedule data does not include a teacher or facilitator field, so I cannot verify which are with Sir Raymund.`
    : `Open slots are ${summary}.`
}

export function buildScheduleAssistantRequest(
  question: string,

  facts: AssistantFacts,
): ScheduleAssistantRequest {
  const intentHint = inferIntent(question)

  const deterministicAnswer =
    intentHint === "availability"
      ? formatAvailability(facts.recurringAvailability, facts.overrides)
      : intentHint === "slot_search"
        ? formatSlotSearch(question, facts.slots)
        : "I can answer questions about your saved availability and open volunteer slots. Try asking when you are free or asking for an open slot."

  return {
    version: 1,

    question,

    intentHint,

    facts,

    deterministicAnswer,
  }
}

function deterministicResponse(
  request: ScheduleAssistantRequest,
): ScheduleAssistantResponse {
  return {
    version: 1,

    answer: request.deterministicAnswer,

    intent: request.intentHint,

    source: "deterministic",

    referencedSlotIds:
      request.intentHint === "slot_search"
        ? request.facts.slots

            .filter(
              (slot) => slot.status === "open" && slot.withinCutoff !== false,
            )

            .map((slot) => slot.id)
        : [],
  }
}

export async function askScheduleAssistant(
  request: ScheduleAssistantRequest,
): Promise<ScheduleAssistantResponse> {
  if (!isSupabaseConfigured) return deterministicResponse(request)

  const { data, error } =
    await supabase.functions.invoke<ScheduleAssistantResponse>(
      "schedule-assistant",

      { body: request },
    )

  if (error || !data || data.version !== 1 || typeof data.answer !== "string") {
    return deterministicResponse(request)
  }

  return {
    ...data,

    intent: request.intentHint,

    referencedSlotIds: deterministicResponse(request).referencedSlotIds,

    source: "llm",
  }
}
