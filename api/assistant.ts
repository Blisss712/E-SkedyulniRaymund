import { assistantEnv, assistantResponse } from "../server/assistant"

export const config = { runtime: "edge" }

/**
 * Vercel Edge Function used by the deployed app. The Gemini key comes from the
 * Vercel project's environment variables, never from the browser.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "POST, OPTIONS" },
    })
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  const body = await request.json().catch(() => null)
  const result = await assistantResponse(body, assistantEnv(process.env))
  return json(result.body, result.status)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
