import { supabase } from "../../lib/supabase"
import type { AssistantTurn } from "./types"

/**
 * The assistant has two possible backends:
 *
 * 1. `/api/assistant` (the default): served by the Vite dev middleware locally
 *    and by the Vercel Edge Function in production. The Gemini key lives in the
 *    root `.env` locally and in Vercel environment variables when deployed.
 * 2. An optional FastAPI helper at `VITE_ASSISTANT_API_URL`.
 *
 * No key is ever shipped to the browser.
 */
const API_ROUTE = "/api/assistant"
const FASTAPI_URL = (
  import.meta.env.VITE_ASSISTANT_API_URL ||
  import.meta.env.VITE_MEMBER_API_URL ||
  import.meta.env.VITE_ADMIN_API_URL ||
  ""
).replace(/\/$/, "")

const HEALTH_TIMEOUT_MS = 4_000
const CHAT_TIMEOUT_MS = 40_000

type Backend = "api" | "fastapi"

type AssistantAnswer = {
  answer: string
  model?: string
}

export type AssistantServerStatus = {
  available: boolean
  configured: boolean
  model?: string
  activeModel?: string
  fallbackModels: string[]
  reason?: "not-configured" | "unreachable"
}

export class AssistantServerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AssistantServerError"
  }
}

let cachedStatus: AssistantServerStatus | null = null
let cachedBackend: Backend | null = null

/** "gemini-3.6-flash" -> "Gemini 3.6 Flash" */
export function modelLabel(model?: string): string {
  if (!model) return "Ministry server"
  return model
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

type HealthBody = {
  configured?: unknown
  model?: unknown
  activeModel?: unknown
  fallbackModels?: unknown
}

function statusFromHealth(body: HealthBody | null): AssistantServerStatus {
  const configured = body?.configured === true
  return {
    available: true,
    configured,
    model: typeof body?.model === "string" ? body.model : undefined,
    activeModel:
      typeof body?.activeModel === "string" ? body.activeModel : undefined,
    fallbackModels: Array.isArray(body?.fallbackModels)
      ? body.fallbackModels.filter(
          (model): model is string => typeof model === "string",
        )
      : [],
    reason: configured ? undefined : "not-configured",
  }
}

function remember(
  backend: Backend | null,
  status: AssistantServerStatus,
): AssistantServerStatus {
  cachedBackend = backend
  cachedStatus = status
  return status
}

async function checkApiRoute(): Promise<AssistantServerStatus | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

  try {
    const response = await fetch(API_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ health: true }),
      signal: controller.signal,
    })
    if (!response.ok) return null

    const body = (await response.json().catch(() => null)) as HealthBody | null
    if (!body || typeof body.configured !== "boolean") return null
    return statusFromHealth(body)
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

async function checkFastApi(): Promise<AssistantServerStatus | null> {
  if (!FASTAPI_URL) return null

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

  try {
    const response = await fetch(`${FASTAPI_URL}/member/assistant/health`, {
      signal: controller.signal,
    })
    if (!response.ok) return null

    const body = (await response.json().catch(() => null)) as HealthBody | null
    return statusFromHealth(body)
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Asks the configured backend whether it has a Gemini key. The panel checks
 * this when it opens so the UI can say "Saved data only" instead of pretending
 * to be AI.
 */
export async function checkAssistantServer(
  force = false,
): Promise<AssistantServerStatus> {
  if (!force && cachedStatus) return cachedStatus

  const apiStatus = await checkApiRoute()
  if (apiStatus?.configured) {
    return remember("api", apiStatus)
  }

  const fastApiStatus = await checkFastApi()
  if (fastApiStatus?.configured) {
    return remember("fastapi", fastApiStatus)
  }

  // Prefer the route that is reachable but has no key: that is the backend the
  // app is configured to use.
  const onlyStatus = apiStatus ?? fastApiStatus
  if (onlyStatus) return remember(null, onlyStatus)

  return remember(null, {
    available: false,
    configured: false,
    fallbackModels: [],
    reason: "not-configured",
  })
}

async function askApiRoute(input: {
  context: string
  messages: AssistantTurn[]
}): Promise<AssistantAnswer> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(API_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
  } catch {
    if (controller.signal.aborted) {
      throw new AssistantServerError(
        "The assistant took too long to answer. Please try again.",
      )
    }
    throw new AssistantServerError(
      "The assistant isn't reachable, so I answered from your saved data.",
    )
  } finally {
    window.clearTimeout(timer)
  }

  const body = (await response.json().catch(() => null)) as {
    answer?: unknown
    model?: unknown
    error?: unknown
  } | null

  if (!response.ok) {
    if (response.status === 503) {
      throw new AssistantServerError(
        "The assistant has no Gemini key configured. Add GEMINI_API_KEY to .env or Vercel.",
      )
    }
    throw new AssistantServerError(
      typeof body?.error === "string"
        ? body.error
        : "The assistant could not answer that right now.",
    )
  }

  if (!body || typeof body.answer !== "string" || !body.answer.trim()) {
    throw new AssistantServerError(
      "The assistant returned an empty answer, so I used your saved data.",
    )
  }

  return {
    answer: body.answer.trim(),
    model: typeof body.model === "string" ? body.model : undefined,
  }
}

async function askFastApi(input: {
  context: string
  messages: AssistantTurn[]
}): Promise<AssistantAnswer> {
  if (!FASTAPI_URL) {
    throw new AssistantServerError(
      "The assistant server is not configured. Set VITE_ASSISTANT_API_URL.",
    )
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new AssistantServerError(
      "Your session expired. Sign in again to use the AI assistant.",
    )
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${FASTAPI_URL}/member/assistant/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
  } catch {
    if (controller.signal.aborted) {
      throw new AssistantServerError(
        "The assistant server took too long to answer. Please try again.",
      )
    }
    throw new AssistantServerError(
      "The assistant server isn't reachable, so I answered from your saved data.",
    )
  } finally {
    window.clearTimeout(timer)
  }

  const body = (await response.json().catch(() => null)) as {
    answer?: unknown
    model?: unknown
    detail?: unknown
  } | null

  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : ""
    if (response.status === 401) {
      throw new AssistantServerError(
        "Your session expired. Sign in again to use the AI assistant.",
      )
    }
    if (response.status === 503) {
      throw new AssistantServerError(
        detail || "The assistant server has no Gemini key configured.",
      )
    }
    throw new AssistantServerError(
      detail || "The assistant server could not answer that right now.",
    )
  }

  if (!body || typeof body.answer !== "string" || !body.answer.trim()) {
    throw new AssistantServerError(
      "The assistant server returned an empty answer, so I used your saved data.",
    )
  }

  return {
    answer: body.answer.trim(),
    model: typeof body.model === "string" ? body.model : undefined,
  }
}

/**
 * Sends the grounded data block and the conversation to the assistant backend.
 * The member's Supabase session identifies who is asking; the Gemini key stays
 * on the server.
 */
export async function askAssistantServer(input: {
  context: string
  messages: AssistantTurn[]
}): Promise<AssistantAnswer> {
  let backend = cachedBackend

  if (!backend) {
    const status = await checkAssistantServer(true)
    backend = cachedBackend
    if (!backend || !status.available || !status.configured) {
      throw new AssistantServerError(
        status.available
          ? "The assistant has no Gemini key configured."
          : "The assistant server isn't reachable, so I answered from your saved data.",
      )
    }
  }

  if (backend === "api") return askApiRoute(input)
  return askFastApi(input)
}
