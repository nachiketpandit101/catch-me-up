import { semanticChunk, type Embedder } from "./semantic";
import { packBlocks, recursiveSplit, type PackOptions } from "./text";

export type ChunkStrategy = "structural" | "semantic";

export type ChunkRecord = {
  series_id: string;
  book_number: number;
  chapter_number: number;
  chunk_index: number;
  content: string;
};

export type ChunkOptions = {
  strategy?: ChunkStrategy;
  embed?: Embedder;
};

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getChunkStrategy(): ChunkStrategy {
  return process.env.CHUNK_STRATEGY === "semantic" ? "semantic" : "structural";
}

function getPackOptions(): PackOptions {
  return {
    targetChars: envNumber("CHUNK_TARGET_CHARS", 1800),
    minChars: envNumber("CHUNK_MIN_CHARS", 500),
    maxChars: envNumber("CHUNK_MAX_CHARS", 2600),
    overlapChars: envNumber("CHUNK_OVERLAP_CHARS", 250),
  };
}

/** Structure-aware split: scene break > paragraph > line > sentence. */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const options = getPackOptions();
  return packBlocks(recursiveSplit(normalized, options.maxChars), options);
}

export async function chunkChapters(
  seriesId: string,
  bookNumber: number,
  chapters: { chapterNumber: number; content: string }[],
  options: ChunkOptions = {},
): Promise<ChunkRecord[]> {
  const strategy = options.strategy ?? getChunkStrategy();
  const packOptions = getPackOptions();
  const records: ChunkRecord[] = [];

  if (strategy === "semantic" && !options.embed) {
    throw new Error("CHUNK_STRATEGY=semantic requires an embedder");
  }

  for (const chapter of chapters) {
    const normalized = chapter.content.replace(/\r\n/g, "\n").trim();
    if (!normalized) continue;

    const pieces =
      strategy === "semantic"
        ? await semanticChunk(normalized, {
            ...packOptions,
            embed: options.embed!,
            bufferSize: envNumber("SEMANTIC_BUFFER_SIZE", 1),
            percentile: envNumber("SEMANTIC_PERCENTILE", 90),
          })
        : chunkText(normalized);

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
