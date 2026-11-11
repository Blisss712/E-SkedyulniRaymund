import { answerLocally, buildDataBlock, buildSnapshot } from "./context"
import {
  AssistantServerError,
  askAssistantServer,
  checkAssistantServer,
} from "./server"
import type { AssistantFacts, AssistantReply, AssistantTurn } from "./types"

/**
 * Answers one question about the member's ministries.
 *
 * The snapshot and the saved-data answer are always built first. If the
 * server-side /api/assistant route has a Gemini key, its answer wins; otherwise
 * the member still gets a useful answer from their own saved data.
 */
export async function askAssistant(input: {
  question: string
  facts: AssistantFacts
  history: AssistantTurn[]
}): Promise<AssistantReply> {
  const snapshot = await buildSnapshot(input.facts)
  const dataBlock = buildDataBlock(snapshot)
  const localAnswer = answerLocally(input.question, snapshot)

  const status = await checkAssistantServer()

  if (status.available && status.configured) {
    try {
      const result = await askAssistantServer({
        context: dataBlock,
        messages: [
          ...input.history.slice(-8),
          { role: "user", text: input.question },
        ],
      })
      return {
        text: result.answer,
        source: "server",
        model: result.model ?? status.activeModel ?? status.model,
      }
    } catch (error) {
      return {
        text: localAnswer,
        source: "local",
        notice:
          error instanceof AssistantServerError
            ? error.message
            : "The assistant server could not answer, so I used your saved data.",
      }
    }
  }

  return { text: localAnswer, source: "local" }
}
