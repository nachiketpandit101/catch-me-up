const TARGET_CHARS = 500 * 4; // ~500 tokens
const OVERLAP_CHARS = 50 * 4; // ~50 tokens

export type ChunkRecord = {
  series_id: string;
  book_number: number;
  chapter_number: number;
  chunk_index: number;
  content: string;
};

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= TARGET_CHARS) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + TARGET_CHARS, normalized.length);

    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const paragraphBreak = window.lastIndexOf("\n\n");
      const sentenceBreak = window.lastIndexOf(". ");
      const breakAt = Math.max(paragraphBreak, sentenceBreak);
      if (breakAt > TARGET_CHARS * 0.5) {
        end = start + breakAt + (sentenceBreak === breakAt ? 1 : 0);
      }
    }

    const piece = normalized.slice(start, end).trim();
    if (piece.length > 40) chunks.push(piece);

    if (end >= normalized.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }

  return chunks;
}

export function chunkChapters(
  seriesId: string,
  bookNumber: number,
  chapters: { chapterNumber: number; content: string }[],
): ChunkRecord[] {
  const records: ChunkRecord[] = [];

  for (const chapter of chapters) {
    const pieces = chunkText(chapter.content);
    pieces.forEach((content, chunkIndex) => {
      records.push({
        series_id: seriesId,
        book_number: bookNumber,
        chapter_number: chapter.chapterNumber,
        chunk_index: chunkIndex,
        content,
      });
    });
  }

  return records;
}
