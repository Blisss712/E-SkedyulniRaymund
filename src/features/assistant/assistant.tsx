import { useEffect, useRef, useState } from "react"

import type { AssistantFacts, AssistantSource, AssistantTurn } from "./types"

import { buildGreeting, suggestedQuestions } from "./context"

import { askAssistant } from "./service"

import { checkAssistantServer, modelLabel } from "./server"

import type { AssistantServerStatus } from "./server"

type ChatItem = {
  id: number

  role: "user" | "assistant"

  text: string

  source?: AssistantSource

  model?: string

  notice?: string

  pending?: boolean

  error?: boolean
}

let nextMessageId = 0

function newId() {
  nextMessageId += 1

  return nextMessageId
}

function sourceLabel(source?: AssistantSource, model?: string): string {
  if (source === "server") return model ? modelLabel(model) : "Ministry server"

  if (source === "local") return "Saved ministry data"

  return ""
}

function SparkIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5l1.8 4.9 4.9 1.8-4.9 1.8L12 16.9l-1.8-4.9L5.3 10.2l4.9-1.8L12 3.5Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.3 15.6l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z"
      />
    </svg>
  )
}

function AssistantAvatar({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#1B3A6B] text-[#F6D48B] ring-2 ring-[#C9921A]/50 ${
        small ? "h-8 w-8" : "h-10 w-10"
      }`}
      aria-hidden="true"
    >
      <SparkIcon className={small ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12h14m0 0-5-5m5 5-5 5"
      />
    </svg>
  )
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Thinking">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#1B3A6B]/45"
          style={{
            animationDelay: `${index * 120}ms`,

            animationDuration: "1s",
          }}
        />
      ))}
    </span>
  )
}

/**
 * The member's ministry assistant. It opens from the floating bubble on the
 * dashboard and stays grounded in the data the dashboard already loaded.
 */

export function AssistantPanel({
  facts,

  onClose,
}: {
  facts: AssistantFacts

  onClose: () => void
}) {
  const [items, setItems] = useState<ChatItem[]>(() => [
    { id: newId(), role: "assistant", text: buildGreeting(facts) },
  ])

  const [question, setQuestion] = useState("")

  const [sending, setSending] = useState(false)

  const [server, setServer] = useState<AssistantServerStatus>({
    available: false,

    configured: false,

    fallbackModels: [],

    reason: "not-configured",
  })

  const scrollRef = useRef<HTMLDivElement>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  const mountedRef = useRef(true)

  const joined = facts.ministries.filter((ministry) => !ministry.waiting)

  const groupLine =
    joined

      .slice(0, 2)

      .map((ministry) => ministry.name)

      .join(" · ") || "Events · messages · slots"

  const serverReady = server.available && server.configured

  const serverModel = server.activeModel ?? server.model

  const showSuggestions =
    !sending && !items.some((item) => item.role === "user")

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  // Ask the assistant backend whether it has a Gemini key. This never asks the

  // member for one; the key lives in the root .env (and Vercel) on the server.

  useEffect(() => {
    let active = true

    void checkAssistantServer(true).then((status) => {
      if (active) setServer(status)
    })

    return () => {
      active = false
    }
  }, [])

  // Ministries finish loading after the panel may already be open; keep the

  // greeting accurate until the member asks their first question.

  useEffect(() => {
    setItems((previous) => {
      if (previous.length !== 1 || previous[0].role !== "assistant") {
        return previous
      }

      const text = buildGreeting(facts)

      return text === previous[0].text ? previous : [{ ...previous[0], text }]
    })
  }, [facts.ministries, facts.memberName])

  useEffect(() => {
    const element = scrollRef.current

    if (!element) return

    if (items.length <= 1 && !sending) {
      element.scrollTop = 0

      return
    }

    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }, [items, sending])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  useEffect(() => {
    const previous = document.body.style.overflow

    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) {
      inputRef.current?.focus()
    }
  }, [])

  function resizeInput(element: HTMLTextAreaElement) {
    element.style.height = "auto"

    element.style.height = `${Math.min(element.scrollHeight, 112)}px`
  }

  async function ask(raw: string) {
    const text = raw.trim()

    if (!text || sending) return

    const history: AssistantTurn[] = items

      .filter((item) => !item.pending && !item.error && item.text)

      .slice(-10)

      .map((item) => ({
        role: item.role === "user" ? "user" : "model",

        text: item.text,
      }))

    const replyId = newId()

    setItems((previous) => [
      ...previous,

      { id: newId(), role: "user", text },

      { id: replyId, role: "assistant", text: "", pending: true },
    ])

    setQuestion("")

    setSending(true)

    if (inputRef.current) inputRef.current.style.height = "auto"

    try {
      const reply = await askAssistant({ question: text, facts, history })

      if (!mountedRef.current) return

      setItems((previous) =>
        previous.map((item) =>
          item.id === replyId
            ? {
                ...item,

                pending: false,

                text: reply.text,

                source: reply.source,

                model: reply.model,

                notice: reply.notice,
              }
            : item,
        ),
      )

      if (reply.source === "server" && reply.model) {
        setServer((previous) => ({
          ...previous,

          configured: true,

          activeModel: reply.model,

          model: previous.model ?? reply.model,
        }))
      }
    } catch {
      if (!mountedRef.current) return

      setItems((previous) =>
        previous.map((item) =>
          item.id === replyId
            ? {
                ...item,

                pending: false,

                error: true,

                text: "I couldn't read your ministry data just now. Please try asking again.",
              }
            : item,
        ),
      )
    } finally {
      if (mountedRef.current) setSending(false)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    void ask(question)
  }

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistant-title"
    >
      <div
        className="assistant-backdrop absolute inset-0 bg-[#0B1E3A]/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <section className="assistant-panel absolute inset-x-0 bottom-0 flex h-[86dvh] max-h-[760px] flex-col overflow-hidden rounded-t-[26px] bg-white shadow-[0_24px_80px_rgba(11,30,58,0.35)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[78vh] sm:max-h-[660px] sm:w-[410px] sm:rounded-[24px]">
        <header className="bg-gradient-to-br from-[#1B3A6B] to-[#142d54] px-4 pb-4 pt-4 text-white">
          <div className="flex items-start gap-3">
            <AssistantAvatar />
            <div className="min-w-0 flex-1">
              <h2
                id="assistant-title"
                className="truncate text-[17px] font-extrabold leading-tight"
              >
                Ministry Assistant
              </h2>
              <p className="mt-0.5 truncate text-xs text-white/70">
                {groupLine}
              </p>
              <span
                title={
                  serverReady
                    ? `${modelLabel(serverModel)} answers come from the parish assistant`
                    : server.available
                      ? "The assistant has no Gemini key yet"
                      : "The assistant isn't reachable; answers come from saved data"
                }
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  serverReady
                    ? "bg-white/10 text-white/80"
                    : "bg-[#C9921A]/25 text-[#F6D48B]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    serverReady ? "bg-[#7EE2A8]" : "bg-[#C9921A]"
                  }`}
                />
                {serverReady ? modelLabel(serverModel) : "Saved data only"}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-[#F8FAFC] px-3.5 py-4"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {items.map((item) => {
            const isUser = item.role === "user"

            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isUser && <AssistantAvatar small />}
                <div
                  className={`min-w-0 max-w-[85%] ${
                    isUser ? "flex flex-col items-end" : ""
                  }`}
                >
                  <div
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                      isUser
                        ? "rounded-br-md bg-[#1B3A6B] text-white"
                        : item.error
                          ? "rounded-bl-md border border-[#F5C6C0] bg-[#FDEDEC] text-[#8E2A20]"
                          : "rounded-bl-md border border-[#E2E8F0] bg-white text-[#1A202C]"
                    }`}
                  >
                    {item.pending ? <TypingDots /> : item.text}
                  </div>

                  {!isUser &&
                    !item.pending &&
                    !item.error &&
                    sourceLabel(item.source, item.model) && (
                      <p className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                        {sourceLabel(item.source, item.model)}
                      </p>
                    )}

                  {item.notice && (
                    <p className="mt-1 rounded-lg bg-[#FFFBF1] px-2 py-1 text-[11px] leading-relaxed text-[#8A6410]">
                      {item.notice}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-[#E2E8F0] bg-white px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5">
          {showSuggestions && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestedQuestions(facts).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void ask(prompt)}
                  className="rounded-full border border-[#D1D9E8] bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-semibold text-[#1B3A6B] transition-colors hover:border-[#1B3A6B]/40 hover:bg-[#E8EDF7]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value)

                resizeInput(event.currentTarget)
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()

                  void ask(question)
                }
              }}
              rows={1}
              maxLength={1000}
              disabled={sending}
              placeholder={
                sending
                  ? "Checking your ministries…"
                  : "Ask about events, messages, or slots…"
              }
              aria-label="Ask the ministry assistant"
              className="max-h-28 min-h-[46px] flex-1 resize-none rounded-2xl border border-[#D1D9E8] bg-[#F8FAFC] px-3.5 py-3 text-[14px] leading-snug text-[#1A202C] placeholder:text-[#94A3B8] focus:border-[#1B3A6B] focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/15 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!question.trim() || sending}
              aria-label="Send question"
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl bg-[#1B3A6B] text-white shadow-sm transition-colors hover:bg-[#142d54] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
            >
              <SendIcon />
            </button>
          </form>

          <div className="mt-1.5 px-1">
            <p className="text-[10px] leading-tight text-[#94A3B8]">
              Grounded in your ministry data. Answers can still be wrong.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
