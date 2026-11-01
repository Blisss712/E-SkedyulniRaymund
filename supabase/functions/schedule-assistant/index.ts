type Intent = "availability" | "slot_search" | "unknown"

type RequestBody = {
  version: 1

  question: string

  intentHint: Intent

  deterministicAnswer: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,

    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null

  if (
    !body ||
    body.version !== 1 ||
    typeof body.question !== "string" ||
    typeof body.deterministicAnswer !== "string"
  ) {
    return jsonResponse({ error: "Invalid schedule assistant request" }, 400)
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")

  if (!apiKey) {
    return jsonResponse({ error: "Schedule assistant is not configured" }, 503)
  }

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash"

  const completion = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,

    {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You are a concise student schedule assistant. Rewrite the supplied deterministic answer in a friendly, clear way. Do not add, remove, infer, or change dates, times, names, availability, slot counts, or constraints. Return only JSON with an answer string.",
            },
          ],
        },

        contents: [
          {
            role: "user",

            parts: [
              {
                text: JSON.stringify({
                  question: body.question,

                  intent: body.intentHint,

                  deterministicAnswer: body.deterministicAnswer,
                }),
              },
            ],
          },
        ],

        generationConfig: {
          temperature: 0.2,

          responseMimeType: "application/json",
        },
      }),
    },
  )

  if (!completion.ok) {
    return jsonResponse({ error: "LLM request failed" }, 502)
  }

  const payload = (await completion.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }

  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text

  if (!content) return jsonResponse({ error: "LLM returned no answer" }, 502)

  let parsed: { answer?: unknown }

  try {
    parsed = (JSON.parse(content) as { answer?: unknown })
  } catch {
    return jsonResponse({ error: "LLM returned invalid JSON" }, 502)
  }

  if (typeof parsed.answer !== "string" || parsed.answer.trim().length === 0) {
    return jsonResponse({ error: "LLM returned an invalid answer" }, 502)
  }

  return jsonResponse({
    version: 1,

    answer: parsed.answer.trim(),

    intent: body.intentHint,

    source: "llm",

    referencedSlotIds: [],
  })
})
