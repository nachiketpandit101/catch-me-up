import { Type } from "@google/genai";
import { createGoogleGenAI } from "@/lib/embeddings";
import type { RetrievedChunk } from "@/lib/types";

/**
 * Cross-encoder reranking.
 *
 * Dense and sparse retrieval score a query and a document independently, so a
 * chunk can rank well while answering a different question. A cross-encoder
 * reads the query and the chunk together, which is far more accurate but too
 * slow to run over a whole corpus — hence reranking only the fused top-N.
 */

export type RerankProvider = "cohere" | "jina" | "tei" | "gemini" | "none";

type ScoredIndex = { index: number; score: number };

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Explicit `RERANK_PROVIDER` wins. Otherwise prefer a dedicated cross-encoder;
 * Gemini is never chosen implicitly because it spends chat quota per query.
 */
export function getRerankProvider(): RerankProvider {
  const explicit = env("RERANK_PROVIDER");
  if (explicit) {
    const known: RerankProvider[] = ["cohere", "jina", "tei", "gemini", "none"];
    if (known.includes(explicit as RerankProvider)) {
      return explicit as RerankProvider;
    }
    console.warn(`Unknown RERANK_PROVIDER "${explicit}"; reranking disabled`);
    return "none";
  }

  if (env("COHERE_API_KEY")) return "cohere";
  if (env("JINA_API_KEY")) return "jina";
  if (env("RERANK_ENDPOINT")) return "tei";
  return "none";
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText} ${detail}`.trim());
  }

  return response.json();
}

async function rerankWithCohere(
  query: string,
  documents: string[],
  topN: number,
  signal: AbortSignal,
): Promise<ScoredIndex[]> {
  const payload = (await postJson(
    "https://api.cohere.com/v2/rerank",
    {
      model: env("COHERE_RERANK_MODEL") ?? "rerank-v3.5",
      query,
      documents,
      top_n: topN,
    },
    { authorization: `Bearer ${env("COHERE_API_KEY")}` },
    signal,
  )) as { results?: { index: number; relevance_score: number }[] };

  return (payload.results ?? []).map((result) => ({
    index: result.index,
    score: result.relevance_score,
  }));
}

async function rerankWithJina(
  query: string,
  documents: string[],
  topN: number,
  signal: AbortSignal,
): Promise<ScoredIndex[]> {
  const payload = (await postJson(
    "https://api.jina.ai/v1/rerank",
    {
      model: env("JINA_RERANK_MODEL") ?? "jina-reranker-v2-base-multilingual",
      query,
      documents,
      top_n: topN,
    },
    { authorization: `Bearer ${env("JINA_API_KEY")}` },
    signal,
  )) as { results?: { index: number; relevance_score: number }[] };

  return (payload.results ?? []).map((result) => ({
    index: result.index,
    score: result.relevance_score,
  }));
}

/** Self-hosted BGE-Reranker served by HuggingFace Text Embeddings Inference. */
async function rerankWithTEI(
  query: string,
  documents: string[],
  _topN: number,
  signal: AbortSignal,
): Promise<ScoredIndex[]> {
  const endpoint = env("RERANK_ENDPOINT")!.replace(/\/+$/, "");
  const apiKey = env("RERANK_API_KEY");

  const payload = (await postJson(
    `${endpoint}/rerank`,
    { query, texts: documents, raw_scores: false },
    apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    signal,
  )) as { index: number; score: number }[];

  return (payload ?? []).map((result) => ({
    index: result.index,
    score: result.score,
  }));
}

/**
 * Listwise LLM fallback. Not a true cross-encoder, but it does read the query
 * and every passage together, which is the property that matters here.
 */
async function rerankWithGemini(
  query: string,
  documents: string[],
  _topN: number,
  signal: AbortSignal,
): Promise<ScoredIndex[]> {
  const docChars = envNumber("RERANK_DOC_CHARS", 1500);
  const passages = documents
    .map((doc, index) => `[${index}]\n${doc.slice(0, docChars)}`)
    .join("\n\n");

  const prompt = [
    "Score how well each passage helps answer the question.",
    "1 means it directly answers, 0 means it is unrelated.",
    "Return one entry per passage, using the passage's bracketed index.",
    "",
    `Question: ${query}`,
    "",
    "Passages:",
    passages,
  ].join("\n");

  const ai = createGoogleGenAI();
  const response = await ai.models.generateContent({
    model: env("GEMINI_RERANK_MODEL") ?? "gemini-2.5-flash-lite",
    contents: prompt,
    config: {
      abortSignal: signal,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            score: { type: Type.NUMBER },
          },
          required: ["index", "score"],
        },
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "[]") as ScoredIndex[];
  return Array.isArray(parsed) ? parsed : [];
}

const PROVIDERS: Record<
  Exclude<RerankProvider, "none">,
  (
    query: string,
    documents: string[],
    topN: number,
    signal: AbortSignal,
  ) => Promise<ScoredIndex[]>
> = {
  cohere: rerankWithCohere,
  jina: rerankWithJina,
  tei: rerankWithTEI,
  gemini: rerankWithGemini,
};

/**
 * Reorder fused candidates by cross-encoder relevance and trim to `topN`.
 * Any provider failure degrades to the incoming fusion order rather than
 * failing the request.
 */
export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  topN: number,
): Promise<RetrievedChunk[]> {
  const provider = getRerankProvider();
  if (provider === "none" || chunks.length <= 1) {
    return chunks.slice(0, topN);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    envNumber("RERANK_TIMEOUT_MS", 8000),
  );

  try {
    const scored = await PROVIDERS[provider](
      query,
      chunks.map((chunk) => chunk.content),
      topN,
      controller.signal,
    );

    const ranked = scored
      .filter(
        (result) =>
          Number.isInteger(result.index) &&
          result.index >= 0 &&
          result.index < chunks.length &&
          Number.isFinite(result.score),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((result) => ({
        ...chunks[result.index],
        rerankScore: result.score,
      }));

    if (ranked.length === 0) {
      console.warn(`Reranker "${provider}" returned no usable scores`);
      return chunks.slice(0, topN);
    }

    return ranked;
  } catch (error) {
    console.warn(
      `Reranker "${provider}" failed, keeping fusion order: ${(error as Error).message}`,
    );
    return chunks.slice(0, topN);
  } finally {
    clearTimeout(timer);
  }
}
