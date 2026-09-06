import { Type } from "@google/genai";
import { getSeriesById, type CatalogSeries } from "@/lib/catalog";
import { createGoogleGenAI } from "@/lib/embeddings";
import { getSpoilerFreeContext, type RetrievalOptions } from "@/lib/retrieval";
import type { CragAction, CragTrace, RetrievedChunk } from "@/lib/types";
import { webSearchForQuery } from "@/lib/web-search";

export type ChunkGrade = {
  id: number;
  relevant: boolean;
  score: number;
};

export type CragResult = {
  query: string;
  chunks: RetrievedChunk[];
  grades: ChunkGrade[];
  trace: CragTrace;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = env(name)?.toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function isDebug(): boolean {
  return process.env.RETRIEVAL_DEBUG === "true";
}

export function relevanceThreshold(): number {
  return envNumber("CRAG_RELEVANCE_THRESHOLD", 0.5);
}

export function confidenceThreshold(): number {
  return envNumber("CRAG_CONFIDENCE_THRESHOLD", 0.55);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * CRAG confidence: mean score of passages the grader marked relevant.
 * Irrelevant-only sets score 0 so the graph can expand or fall back.
 */
export function retrievalConfidence(grades: ChunkGrade[]): number {
  if (grades.length === 0) return 0;
  const relevant = grades.filter(
    (grade) => grade.relevant && grade.score >= relevanceThreshold(),
  );
  if (relevant.length === 0) return 0;
  return mean(relevant.map((grade) => grade.score));
}

export function decideCorrectiveAction(
  confidence: number,
  alreadyExpanded: boolean,
  alreadySearched: boolean,
  webEnabled: boolean,
  relevantCorpusCount: number,
  relevantTotalCount = relevantCorpusCount,
): CragAction {
  const strong = confidence >= confidenceThreshold() && relevantTotalCount > 0;

  if (relevantCorpusCount > 0 && (strong || alreadyExpanded)) return "use";
  if (!alreadyExpanded) return "expand";
  if (relevantCorpusCount > 0) return "use";
  if (webEnabled && !alreadySearched) return "web";
  if (relevantTotalCount > 0) return "use";
  return "refuse";
}

export function mergeChunks(
  current: RetrievedChunk[],
  incoming: RetrievedChunk[],
): RetrievedChunk[] {
  const merged = new Map<number, RetrievedChunk>();
  for (const chunk of [...current, ...incoming]) {
    const existing = merged.get(chunk.id);
    if (!existing) {
      merged.set(chunk.id, chunk);
      continue;
    }
    const existingScore =
      existing.gradeScore ?? existing.rerankScore ?? existing.fusedScore ?? 0;
    const nextScore =
      chunk.gradeScore ?? chunk.rerankScore ?? chunk.fusedScore ?? 0;
    if (nextScore >= existingScore) merged.set(chunk.id, chunk);
  }
  return [...merged.values()];
}

export function applyGrades(
  chunks: RetrievedChunk[],
  grades: ChunkGrade[],
): RetrievedChunk[] {
  const byId = new Map(grades.map((grade) => [grade.id, grade]));
  return chunks.map((chunk) => {
    const grade = byId.get(chunk.id);
    return grade ? { ...chunk, gradeScore: grade.score } : chunk;
  });
}

export function corpusRelevantCount(
  chunks: RetrievedChunk[],
  grades: ChunkGrade[],
): number {
  const threshold = relevanceThreshold();
  const corpusIds = new Set(
    chunks.filter((chunk) => chunk.source !== "web").map((chunk) => chunk.id),
  );
  return grades.filter(
    (grade) =>
      corpusIds.has(grade.id) &&
      grade.relevant &&
      grade.score >= threshold,
  ).length;
}

export function selectRelevantChunks(
  chunks: RetrievedChunk[],
  grades: ChunkGrade[],
): RetrievedChunk[] {
  const threshold = relevanceThreshold();
  const graded = applyGrades(chunks, grades);
  const relevant = graded.filter((chunk) => {
    const grade = grades.find((entry) => entry.id === chunk.id);
    if (!grade) return false;
    return grade.relevant && grade.score >= threshold;
  });

  if (relevant.length === 0) return [];

  const corpus = relevant
    .filter((chunk) => chunk.source !== "web")
    .sort((a, b) => (b.gradeScore ?? 0) - (a.gradeScore ?? 0));
  const web = relevant
    .filter((chunk) => chunk.source === "web")
    .sort((a, b) => (b.gradeScore ?? 0) - (a.gradeScore ?? 0))
    .slice(0, 3);

  // Book passages first so the answerer grounds in the corpus when both exist.
  return corpus.length > 0 ? [...corpus, ...web] : web;
}

function completeGrades(
  chunks: RetrievedChunk[],
  parsed: ChunkGrade[],
): ChunkGrade[] {
  const byId = new Map(parsed.map((grade) => [grade.id, grade]));
  return chunks.map((chunk) => {
    const existing = byId.get(chunk.id);
    if (existing) return existing;
    // Grader output is often truncated on large batches. Keep omitted book
    // passages instead of treating silence as "irrelevant".
    if (chunk.source === "web") {
      return { id: chunk.id, relevant: false, score: 0 };
    }
    return {
      id: chunk.id,
      relevant: true,
      score: Math.max(
        chunk.rerankScore ?? chunk.fusedScore ?? chunk.similarity ?? 0.55,
        0.55,
      ),
    };
  });
}

async function gradeChunkBatch(
  query: string,
  chunks: RetrievedChunk[],
  maxBook: number,
  series?: CatalogSeries,
): Promise<ChunkGrade[]> {
  const docChars = envNumber("CRAG_DOC_CHARS", 1200);
  const later =
    series?.books
      .filter((book) => book.number > maxBook)
      .map((book) => book.title)
      .join(", ") ?? "";

  const passages = chunks
    .map((chunk) => {
      const origin =
        chunk.source === "web"
          ? `Web: ${chunk.title ?? "source"}`
          : `Book ${chunk.book_number}, Ch. ${chunk.chapter_number}`;
      return `[id=${chunk.id} | ${origin}]\n${chunk.content.slice(0, docChars)}`;
    })
    .join("\n\n");

  const prompt = [
    "Grade each passage for whether it could help answer the question.",
    "Book scenes, names, relationships, and background count as relevant even when they are not a complete summary.",
    "relevant=true if the passage contains any facts that support an answer.",
    "Prefer marking book passages relevant over web summaries when both cover the same ground.",
    `The reader has finished Book ${maxBook}. Mark a passage irrelevant if it is off-topic OR if it describes events from later books${later ? ` (${later})` : ""}.`,
    "score is from 0 (unrelated) to 1 (directly answers).",
    "Return one object per passage, using that passage's id.",
    "",
    `Question: ${query}`,
    "",
    "Passages:",
    passages,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    envNumber("CRAG_GRADE_TIMEOUT_MS", 8000),
  );

  try {
    const ai = createGoogleGenAI();
    const response = await ai.models.generateContent({
      model: env("GEMINI_CRAG_MODEL") ?? "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        abortSignal: controller.signal,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              relevant: { type: Type.BOOLEAN },
              score: { type: Type.NUMBER },
            },
            required: ["id", "relevant", "score"],
          },
        },
      },
    });

    const parsed = JSON.parse(response.text ?? "[]") as ChunkGrade[];
    if (!Array.isArray(parsed)) return [];

    const allowed = new Set(chunks.map((chunk) => chunk.id));
    return parsed.filter(
      (grade) =>
        allowed.has(grade.id) &&
        typeof grade.relevant === "boolean" &&
        Number.isFinite(grade.score),
    );
  } catch (error) {
    console.warn(
      `CRAG grader failed, keeping retrieved chunks: ${(error as Error).message}`,
    );
    return chunks.map((chunk) => ({
      id: chunk.id,
      relevant: true,
      score: Math.max(
        chunk.rerankScore ?? chunk.fusedScore ?? chunk.similarity ?? 0.7,
        0.7,
      ),
    }));
  } finally {
    clearTimeout(timer);
  }
}

async function gradeChunks(
  query: string,
  chunks: RetrievedChunk[],
  maxBook: number,
  series?: CatalogSeries,
): Promise<ChunkGrade[]> {
  if (chunks.length === 0) return [];

  const batchSize = 12;
  const parsed: ChunkGrade[] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    parsed.push(
      ...(await gradeChunkBatch(
        query,
        chunks.slice(i, i + batchSize),
        maxBook,
        series,
      )),
    );
  }

  return completeGrades(chunks, parsed);
}

async function gradeNewChunks(
  query: string,
  chunks: RetrievedChunk[],
  existing: ChunkGrade[],
  maxBook: number,
  series?: CatalogSeries,
): Promise<ChunkGrade[]> {
  const known = new Set(existing.map((grade) => grade.id));
  const fresh = chunks.filter((chunk) => !known.has(chunk.id));
  const next = fresh.length
    ? await gradeChunks(query, fresh, maxBook, series)
    : [];
  const live = new Set(chunks.map((chunk) => chunk.id));
  return [...existing, ...next].filter((grade) => live.has(grade.id));
}

async function expandQuery(
  query: string,
  maxBook: number,
  series?: CatalogSeries,
): Promise<string[]> {
  const allowed =
    series?.books
      .filter((book) => book.number <= maxBook)
      .map((book) => `Book ${book.number}: ${book.title}`)
      .join("; ") ?? `books 1–${maxBook}`;

  const prompt = [
    "Rewrite the question into 1-3 retrieval queries for a spoiler-bounded book corpus.",
    "Keep the same intent. Add likely aliases, full names, places, and plot terms.",
    `The reader has only finished ${allowed}. Do not invent later-book events.`,
    "",
    `Original: ${query}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    envNumber("CRAG_EXPAND_TIMEOUT_MS", 8000),
  );

  try {
    const ai = createGoogleGenAI();
    const response = await ai.models.generateContent({
      model: env("GEMINI_CRAG_MODEL") ?? "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        abortSignal: controller.signal,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            queries: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["queries"],
        },
      },
    });

    const parsed = JSON.parse(response.text ?? "{}") as { queries?: string[] };
    const queries = (parsed.queries ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.toLowerCase() !== query.toLowerCase());

    return queries.slice(0, 3);
  } catch (error) {
    console.warn(
      `CRAG query expansion failed: ${(error as Error).message}`,
    );
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function logCrag(message: string) {
  if (isDebug()) console.log(`[crag] ${message}`);
}

/**
 * Retrieve → grade → (expand | web search) until confidence clears the
 * threshold or corrective attempts are exhausted.
 */
export async function retrieveWithCrag(
  query: string,
  seriesId: string,
  maxBook: number,
  options?: RetrievalOptions,
): Promise<CragResult> {
  const series = getSeriesById(seriesId);
  const webEnabled = envFlag("CRAG_WEB_SEARCH", true);
  const enabled = envFlag("CRAG_ENABLED", true);

  let chunks = await getSpoilerFreeContext(query, seriesId, maxBook, options);

  if (!enabled) {
    return {
      query,
      chunks,
      grades: [],
      trace: {
        action: "use",
        confidence: 1,
        usedExpansion: false,
        usedWeb: false,
        graded: 0,
        relevant: chunks.length,
      },
    };
  }

  let grades = await gradeChunks(query, chunks, maxBook, series);
  let confidence = retrievalConfidence(grades);
  let usedExpansion = false;
  let usedWeb = false;
  let expandedQuery: string | undefined;
  const nextAction = () =>
    decideCorrectiveAction(
      confidence,
      usedExpansion,
      usedWeb,
      webEnabled,
      corpusRelevantCount(chunks, grades),
      grades.filter(
        (grade) => grade.relevant && grade.score >= relevanceThreshold(),
      ).length,
    );
  let action = nextAction();

  logCrag(
    `"${query}" retrieved=${chunks.length} relevant=${grades.filter((g) => g.relevant).length} confidence=${confidence.toFixed(3)} action=${action}`,
  );

  if (action === "expand") {
    const expansions = await expandQuery(query, maxBook, series);
    usedExpansion = true;
    expandedQuery = expansions[0];

    if (expansions.length > 0) {
      const extra: RetrievedChunk[] = [];
      for (const nextQuery of expansions) {
        extra.push(
          ...(await getSpoilerFreeContext(nextQuery, seriesId, maxBook, {
            ...options,
            queryEmbedding: undefined,
          })),
        );
      }
      chunks = mergeChunks(chunks, extra);
      grades = await gradeNewChunks(query, chunks, grades, maxBook, series);
      confidence = retrievalConfidence(grades);
      logCrag(
        `expanded via "${expansions.join(" | ")}" retrieved=${chunks.length} confidence=${confidence.toFixed(3)}`,
      );
    }

    action = nextAction();
  }

  if (action === "web") {
    usedWeb = true;
    try {
      const webChunks = await webSearchForQuery({
        query: expandedQuery ?? query,
        seriesId,
        maxBook,
        series,
      });
      chunks = mergeChunks(chunks, webChunks);
      grades = await gradeNewChunks(query, chunks, grades, maxBook, series);
      confidence = retrievalConfidence(grades);
      logCrag(
        `web hits=${webChunks.length} retrieved=${chunks.length} confidence=${confidence.toFixed(3)}`,
      );
    } catch (error) {
      console.warn(`CRAG web search failed: ${(error as Error).message}`);
    }
    action = nextAction();
  }

  const selected =
    action === "refuse" ? [] : selectRelevantChunks(chunks, grades);

  const trace: CragTrace = {
    action: selected.length === 0 ? "refuse" : "use",
    confidence,
    usedExpansion,
    usedWeb,
    expandedQuery,
    graded: grades.length,
    relevant: selected.length,
  };

  logCrag(
    `final action=${trace.action} kept=${selected.length} expansion=${usedExpansion} web=${usedWeb}`,
  );

  return { query, chunks: selected, grades, trace };
}
