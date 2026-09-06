import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { formatCitationLabel } from "@/lib/citations";
import {
  enforceGrounding,
  insufficientContextMessage,
} from "@/lib/grounding";
import type { RetrievedChunk } from "@/lib/types";

export function getChatModelId(): string {
  return process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";
}

export function getMaxOutputTokens(): number {
  const raw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? 4096);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 4096;
}

function chunkHeading(chunk: RetrievedChunk): string {
  if (chunk.source === "web") {
    const title = chunk.title?.trim() || "Web source";
    return `[chunk:${chunk.id} | ${title}]`;
  }
  return `[chunk:${chunk.id} | ${formatCitationLabel(chunk.book_number, chunk.chapter_number)}]`;
}

export function buildAntiSpoilerSystemPrompt(
  maxBook: number,
  retrievedChunks: RetrievedChunk[],
): string {
  const context =
    retrievedChunks.length > 0
      ? retrievedChunks
          .map((chunk) => `${chunkHeading(chunk)}\n${chunk.content}`)
          .join("\n---\n")
      : "(No matching context chunks were retrieved for this question.)";

  const ids = retrievedChunks.map((chunk) => chunk.id).join(", ");

  return `
You are a spoiler-free story assistant helping a reader catch up.
Answer the user's question strictly using ONLY the provided Context Chunks below.

Strict Constraints:
1. The user has read up to Book ${maxBook}.
2. If the answer cannot be verified from the provided context, reply exactly:
   "${insufficientContextMessage(maxBook)}"
3. Do NOT use outside knowledge about future events, deaths, or twists past Book ${maxBook}.

Citation rules:
- Prefer book Context Chunks over web chunks. Use web chunks only to fill gaps the books do not cover.
- Every factual sentence MUST include the supporting chunk ID(s) in square brackets before the period, e.g. Darrow is a Red [12]. or a synthesis [12, 40].
- Use only these chunk IDs: ${ids || "(none)"}.
- Never invent IDs. Never cite a chunk that does not support that sentence.
- If a sentence cannot be grounded in a chunk, omit it.
- Do not include a Sources section; citations belong inline as [id].

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

export type GroundedReply = {
  text: string;
  citedChunkIds: number[];
  grounded: boolean;
};

async function generateOnce(
  prompt: string,
  system: string,
): Promise<string> {
  const result = await generateText({
    model: createChatModel(),
    system,
    prompt,
    maxOutputTokens: getMaxOutputTokens(),
    maxRetries: 1,
  });
  return result.text.trim();
}

export async function generateSpoilerFreeReply(options: {
  prompt: string;
  maxBook: number;
  retrievedChunks: RetrievedChunk[];
}): Promise<GroundedReply> {
  if (options.retrievedChunks.length === 0) {
    return {
      text: insufficientContextMessage(options.maxBook),
      citedChunkIds: [],
      grounded: false,
    };
  }

  const system = buildAntiSpoilerSystemPrompt(
    options.maxBook,
    options.retrievedChunks,
  );

  let raw = await generateOnce(options.prompt, system);
  let grounded = enforceGrounding(
    raw,
    options.retrievedChunks,
    options.maxBook,
  );

  if (!grounded.ok) {
    const retryPrompt = [
      options.prompt,
      "",
      "Your previous draft was rejected by the grounding checker.",
      grounded.unknownIds.length > 0
        ? `These IDs are not in the context: ${grounded.unknownIds.join(", ")}.`
        : "One or more sentences had no valid chunk citations.",
      "Rewrite the answer so every factual sentence cites a valid [chunk id].",
      `If you cannot, reply exactly: "${insufficientContextMessage(options.maxBook)}"`,
    ].join("\n");

    raw = await generateOnce(retryPrompt, system);
    grounded = enforceGrounding(
      raw,
      options.retrievedChunks,
      options.maxBook,
    );
  }

  return {
    text: grounded.text,
    citedChunkIds: grounded.citedIds,
    grounded: grounded.grounded,
  };
}
