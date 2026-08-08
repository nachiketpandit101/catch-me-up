import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;

function getApiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
  }
  return key;
}

function normalizeEmbedding(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  if (!norm) return values;
  return values.map((v) => v / norm);
}

function assertEmbedding(values: number[] | undefined): number[] {
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Unexpected embedding size: ${values?.length ?? 0} (expected ${EMBEDDING_DIMS})`,
    );
  }
  return normalizeEmbedding(values);
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { status?: number; message?: string };
  return (
    err.status === 429 ||
    Boolean(err.message?.includes("RESOURCE_EXHAUSTED")) ||
    Boolean(err.message?.includes("429"))
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createGoogleGenAI() {
  return new GoogleGenAI({ apiKey: getApiKey() });
}

async function embedWithRetry(
  ai: GoogleGenAI,
  texts: string | string[],
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  maxAttempts = 8,
) {
  let delayMs = 5_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts,
        config: {
          outputDimensionality: EMBEDDING_DIMS,
          taskType,
        },
      });
    } catch (error) {
      if (!isRateLimitError(error) || attempt === maxAttempts) {
        throw error;
      }
      console.warn(
        `  Rate limited (429). Waiting ${Math.round(delayMs / 1000)}s before retry ${attempt}/${maxAttempts - 1}...`,
      );
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 120_000);
    }
  }

  throw new Error("embedWithRetry exhausted attempts");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = createGoogleGenAI();
  const response = await embedWithRetry(ai, text, "RETRIEVAL_QUERY");
  return assertEmbedding(response.embeddings?.[0]?.values);
}

/**
 * Embed texts with free-tier-friendly pacing.
 * Default batch size is 1; set EMBED_BATCH_SIZE / EMBED_DELAY_MS to tune.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = Number(process.env.EMBED_BATCH_SIZE ?? 1),
  delayMs = Number(process.env.EMBED_DELAY_MS ?? 1200),
): Promise<number[][]> {
  const ai = createGoogleGenAI();
  const all: number[][] = [];
  const size = Math.max(1, batchSize);

  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size);
    const response = await embedWithRetry(ai, batch, "RETRIEVAL_DOCUMENT");
    const embeddings = response.embeddings ?? [];

    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embedding batch size mismatch: got ${embeddings.length}, expected ${batch.length}`,
      );
    }

    for (const emb of embeddings) {
      all.push(assertEmbedding(emb.values));
    }

    if ((i / size) % 10 === 0 || i + size >= texts.length) {
      console.log(`  Embedded ${Math.min(i + size, texts.length)} / ${texts.length}`);
    }

    if (i + size < texts.length) {
      await sleep(delayMs);
    }
  }

  return all;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMS };
