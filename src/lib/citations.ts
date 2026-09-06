import type { CragTrace, RetrievedChunk } from "@/lib/types";

/**
 * Citations travel as a base64 response header so the answer itself can stay a
 * plain text stream. They are available as soon as the response arrives, before
 * the first token is rendered.
 */
export const SOURCES_HEADER = "x-sources";
export const CRAG_HEADER = "x-crag";

export type Citation = {
  bookNumber: number;
  chapterNumber: number;
  /** Human-readable label, e.g. "Book 2, Ch. 14" or a web page title. */
  label: string;
  /** Retrieved chunks backing this chapter. */
  chunkCount: number;
  chunkIds?: number[];
  bestSimilarity?: number;
  bestRerankScore?: number;
  source?: "corpus" | "web";
  url?: string;
};

export function formatCitationLabel(
  bookNumber: number,
  chapterNumber: number,
): string {
  // parseChapters assigns chapter 0 to a prologue.
  const chapter = chapterNumber === 0 ? "Prologue" : `Ch. ${chapterNumber}`;
  return `Book ${bookNumber}, ${chapter}`;
}

function higher(a: number | undefined, b: number | undefined) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function citationLabel(chunk: RetrievedChunk): string {
  if (chunk.source === "web") {
    return chunk.title?.trim() ? `Web: ${chunk.title.trim()}` : "Web source";
  }
  return formatCitationLabel(chunk.book_number, chunk.chapter_number);
}

function citationKey(chunk: RetrievedChunk): string {
  if (chunk.source === "web") {
    return `web:${chunk.url ?? chunk.title ?? chunk.id}`;
  }
  return `${chunk.book_number}:${chunk.chapter_number}`;
}

/** Collapse chunks to one citation per chapter (or web page), in reading order. */
export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  const byKey = new Map<string, Citation>();

  for (const chunk of chunks) {
    const key = citationKey(chunk);
    const existing = byKey.get(key);

    if (existing) {
      existing.chunkCount += 1;
      existing.chunkIds = [...(existing.chunkIds ?? []), chunk.id];
      existing.bestSimilarity = higher(existing.bestSimilarity, chunk.similarity);
      existing.bestRerankScore = higher(
        existing.bestRerankScore,
        chunk.rerankScore,
      );
      continue;
    }

    byKey.set(key, {
      bookNumber: chunk.book_number,
      chapterNumber: chunk.chapter_number,
      label: citationLabel(chunk),
      chunkCount: 1,
      chunkIds: [chunk.id],
      bestSimilarity: chunk.similarity,
      bestRerankScore: chunk.rerankScore,
      source: chunk.source === "web" ? "web" : "corpus",
      url: chunk.url,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if ((a.source === "web") !== (b.source === "web")) {
      return a.source === "web" ? 1 : -1;
    }
    return a.bookNumber - b.bookNumber || a.chapterNumber - b.chapterNumber;
  });
}

export function citationsForChunkIds(
  chunks: RetrievedChunk[],
  citedIds: Iterable<number>,
): Citation[] {
  const allowed = new Set(citedIds);
  return buildCitations(chunks.filter((chunk) => allowed.has(chunk.id)));
}

// btoa/atob rather than Buffer, so this module works on the server and in the
// browser bundle alike.
export function encodeCitations(citations: Citation[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(citations));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeCitations(value: string | null): Citation[] {
  if (!value) return [];

  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? (parsed as Citation[]) : [];
  } catch {
    return [];
  }
}

function encodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function encodeCragTrace(trace: CragTrace): string {
  return encodeJson(trace);
}

export function decodeCragTrace(value: string | null): CragTrace | null {
  if (!value) return null;

  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as CragTrace;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.confidence !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
