import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMS = 768;

function getApiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
  }
  return key;
}

export function createGoogleGenAI() {
  return new GoogleGenAI({ apiKey: getApiKey() });
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = createGoogleGenAI();
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMS },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Unexpected embedding size: ${values?.length ?? 0} (expected ${EMBEDDING_DIMS})`,
    );
  }
  return values;
}

export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = 16,
): Promise<number[][]> {
  const ai = createGoogleGenAI();
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: { outputDimensionality: EMBEDDING_DIMS },
    });

    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embedding batch size mismatch: got ${embeddings.length}, expected ${batch.length}`,
      );
    }

    for (const emb of embeddings) {
      const values = emb.values;
      if (!values || values.length !== EMBEDDING_DIMS) {
        throw new Error(
          `Unexpected embedding size: ${values?.length ?? 0} (expected ${EMBEDDING_DIMS})`,
        );
      }
      all.push(values);
    }

    // Gentle pacing for free-tier rate limits
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return all;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMS };
