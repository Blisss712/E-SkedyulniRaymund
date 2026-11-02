import { useState } from "react"

import { Button } from "../../shared/ui"

import type { AssistantFacts } from "./types"

import { askScheduleAssistant, buildScheduleAssistantRequest } from "./service"

export function ScheduleAssistantPanel({
  facts,

  onClose,
}: {
  facts: AssistantFacts

  onClose: () => void
}) {
  const [question, setQuestion] = useState("")

  const [answer, setAnswer] = useState<string | null>(null)

  const [source, setSource] = useState<"llm" | "deterministic" | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuestion = question.trim()

    if (!trimmedQuestion || loading) return

    setLoading(true)

    setAnswer(null)

    setSource(null)

    setError(null)

    try {
      const response = await askScheduleAssistant(
        buildScheduleAssistantRequest(trimmedQuestion, facts),
      )

      setAnswer(response.answer)

      setSource(response.source)
    } catch {
      setError(
        "The assistant could not answer right now. Please check the schedule tabs and try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-assistant-title"
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#C9921A]">
              Schedule assistant
            </p>
            <h2
              id="schedule-assistant-title"
              className="mt-1 text-2xl font-extrabold text-[#1B3A6B]"
            >
              Ask about your schedule
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-bold text-[#64748B] hover:bg-[#F4F6FB]"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label
            htmlFor="schedule-assistant-question"
            className="block text-sm font-semibold text-[#1A202C]"
          >
            What would you like to know?
          </label>
          <textarea
            id="schedule-assistant-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="When am I free?"
            rows={3}
            className="w-full resize-none rounded-2xl border border-[#D1D9E8] px-4 py-3 text-base text-[#1A202C] outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20"
            disabled={loading}
          />
          <Button type="submit" disabled={!question.trim() || loading}>
            {loading ? "Checking your schedule…" : "Ask assistant"}
          </Button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl bg-[#FDEDEC] p-4 text-sm text-[#C0392B]"
          >
            {error}
          </p>
        )}

        {answer && (
          <div className="mt-4 rounded-2xl bg-[#E8EDF7] p-4">
            <p className="text-base leading-relaxed text-[#1A202C]">{answer}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              {source === "llm"
                ? "Formatted by the schedule assistant"
                : "Based on the saved schedule"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
