import type { RetrievedChunk } from "@/lib/types";

/**
 * Citations travel as a base64 response header so the answer itself can stay a
 * plain text stream. They are available as soon as the response arrives, before
 * the first token is rendered.
 */
export const SOURCES_HEADER = "x-sources";

export type Citation = {
  bookNumber: number;
  chapterNumber: number;
  /** Human-readable label, e.g. "Book 2, Ch. 14". */
  label: string;
  /** Retrieved chunks backing this chapter. */
  chunkCount: number;
  bestSimilarity?: number;
  bestRerankScore?: number;
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

/** Collapse chunks to one citation per chapter, in reading order. */
export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  const byChapter = new Map<string, Citation>();

  for (const chunk of chunks) {
    const key = `${chunk.book_number}:${chunk.chapter_number}`;
    const existing = byChapter.get(key);

    if (existing) {
      existing.chunkCount += 1;
      existing.bestSimilarity = higher(existing.bestSimilarity, chunk.similarity);
      existing.bestRerankScore = higher(
        existing.bestRerankScore,
        chunk.rerankScore,
      );
      continue;
    }

    byChapter.set(key, {
      bookNumber: chunk.book_number,
      chapterNumber: chunk.chapter_number,
      label: formatCitationLabel(chunk.book_number, chunk.chapter_number),
      chunkCount: 1,
      bestSimilarity: chunk.similarity,
      bestRerankScore: chunk.rerankScore,
    });
  }

  return [...byChapter.values()].sort(
    (a, b) =>
      a.bookNumber - b.bookNumber || a.chapterNumber - b.chapterNumber,
  );
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
