import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import type { BookChunk } from "@/lib/types";


export function getChatModelId(): string {
  return process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";
}

export function getMaxOutputTokens(): number {
  const raw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? 4096);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 4096;
}

export function buildAntiSpoilerSystemPrompt(
  maxBook: number,
  retrievedChunks: BookChunk[],
): string {
  const context =
    retrievedChunks.length > 0
      ? retrievedChunks
          .map(
            (c, i) =>
              `[Chunk ${i + 1} | Book ${c.book_number}, Ch. ${c.chapter_number}]\n${c.content}`,
          )
          .join("\n---\n")
      : "(No matching context chunks were retrieved for this question.)";

  return `
You are a spoiler-free story assistant helping a reader catch up.
Answer the user's question strictly using ONLY the provided Context Chunks below.

Strict Constraints:
1. The user has read up to Book ${maxBook}.
2. If the answer cannot be verified from the provided context, reply:
   "Based on your progress up to Book ${maxBook}, this event has not occurred yet or is not mentioned."
3. Do NOT use outside knowledge about future events, deaths, or twists past Book ${maxBook}.

Answer style:
- Be detailed and concrete: include names, relationships, locations, motives, and what happened in order when the context supports it.
- Use multiple paragraphs when helpful. Prefer a thorough refresher over a one-sentence summary.
- If several context chunks are relevant, synthesize them into one coherent explanation.
- Stay grounded — do not invent details that are not in the Context Chunks.

Context Chunks:
${context}
`.trim();
}

export function createChatModel() {
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  return google(getChatModelId());
}

export async function streamSpoilerFreeReply(options: {
  prompt: string;
  maxBook: number;
  retrievedChunks: BookChunk[];
}) {
  const system = buildAntiSpoilerSystemPrompt(
    options.maxBook,
    options.retrievedChunks,
  );

  return streamText({
    model: createChatModel(),
    system,
    prompt: options.prompt,
    maxOutputTokens: getMaxOutputTokens(),
    // Avoid burning remaining quota with rapid automatic retries on 429
    maxRetries: 1,
  });
}
