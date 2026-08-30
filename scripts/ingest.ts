import { config } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateEmbeddingsBatch } from "../src/lib/embeddings";
import { chunkChapters } from "../src/lib/ingest/chunk";
import { parseChapters } from "../src/lib/ingest/parse";

config({ path: ".env.local" });
config({ path: ".env" });

type ManifestBook = {
  bookNumber: number;
  title: string;
  path: string;
};

type ManifestSeries = {
  id: string;
  title: string;
  books: ManifestBook[];
};

type Manifest = {
  series: ManifestSeries[];
};

type IngestCheckpoint = {
  seriesId: string;
  bookNumber: number;
  nextChunkIndex: number;
  totalChunks: number;
  updatedAt: string;
};

type IngestOptions = {
  seriesFilter?: string;
  bookNumbers?: number[];
  fresh: boolean;
};

function parseArgs(argv: string[]): IngestOptions {
  let seriesFilter: string | undefined;
  const bookNumberSet = new Set<number>();
  let fresh = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fresh") {
      fresh = true;
      continue;
    }
    if (arg.startsWith("--books=")) {
      for (const n of arg.slice("--books=".length).split(",")) {
        const parsed = Number(n.trim());
        if (Number.isInteger(parsed) && parsed > 0) bookNumberSet.add(parsed);
      }
      continue;
    }
    if (arg === "--books" && argv[i + 1]) {
      for (const n of argv[i + 1].split(",")) {
        const parsed = Number(n.trim());
        if (Number.isInteger(parsed) && parsed > 0) bookNumberSet.add(parsed);
      }
      i++;
      continue;
    }
    if (/^\d+$/.test(arg)) {
      bookNumberSet.add(Number(arg));
      continue;
    }
    if (!arg.startsWith("-") && !seriesFilter) {
      seriesFilter = arg;
    }
  }

  const bookNumbers =
    bookNumberSet.size > 0 ? [...bookNumberSet].sort((a, b) => a - b) : undefined;

  return { seriesFilter, bookNumbers, fresh };
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadManifest(): Promise<Manifest> {
  const raw = await readFile(
    path.join(process.cwd(), "data", "manifest.json"),
    "utf8",
  );
  return JSON.parse(raw) as Manifest;
}

function checkpointPath(seriesId: string, bookNumber: number) {
  return path.join(
    process.cwd(),
    "data",
    ".ingest-cache",
    `${seriesId}-book-${bookNumber}.json`,
  );
}

async function loadCheckpoint(
  seriesId: string,
  bookNumber: number,
): Promise<IngestCheckpoint | null> {
  try {
    const raw = await readFile(checkpointPath(seriesId, bookNumber), "utf8");
    return JSON.parse(raw) as IngestCheckpoint;
  } catch {
    return null;
  }
}

async function saveCheckpoint(checkpoint: IngestCheckpoint) {
  const dir = path.join(process.cwd(), "data", ".ingest-cache");
  await mkdir(dir, { recursive: true });
  await writeFile(
    checkpointPath(checkpoint.seriesId, checkpoint.bookNumber),
    JSON.stringify(checkpoint, null, 2),
    "utf8",
  );
}

async function clearCheckpoint(seriesId: string, bookNumber: number) {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(checkpointPath(seriesId, bookNumber));
  } catch {
    // no checkpoint file
  }
}

async function ingestBook(
  seriesId: string,
  book: ManifestBook,
  options: { fresh: boolean },
): Promise<void> {
  const filePath = path.join(process.cwd(), book.path);
  console.log(
    `\nReading ${book.title} (book ${book.bookNumber}) from ${book.path}`,
  );

  const raw = await readFile(filePath, "utf8");
  const chapters = parseChapters(raw);
  console.log(`  Parsed ${chapters.length} chapters`);

  const chunks = chunkChapters(seriesId, book.bookNumber, chapters);
  console.log(`  Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    console.warn("  No chunks to embed; skipping");
    return;
  }

  const supabase = getSupabase();
  const existing = options.fresh ? null : await loadCheckpoint(seriesId, book.bookNumber);
  let startIndex = 0;

  if (options.fresh) {
    await clearCheckpoint(seriesId, book.bookNumber);
    const { error: deleteError } = await supabase
      .from("book_chunks")
      .delete()
      .eq("series_id", seriesId)
      .eq("book_number", book.bookNumber);
    if (deleteError) {
      throw new Error(`Failed to clear old chunks: ${deleteError.message}`);
    }
    console.log("  Cleared existing chunks (--fresh)");
  } else if (existing && existing.totalChunks === chunks.length) {
    startIndex = existing.nextChunkIndex;
    if (startIndex >= chunks.length) {
      console.log("  Already fully ingested; skipping (use --fresh to redo)");
      return;
    }
    console.log(`  Resuming from chunk ${startIndex + 1} / ${chunks.length}`);
  } else {
    const { error: deleteError } = await supabase
      .from("book_chunks")
      .delete()
      .eq("series_id", seriesId)
      .eq("book_number", book.bookNumber);
    if (deleteError) {
      throw new Error(`Failed to clear old chunks: ${deleteError.message}`);
    }
    await clearCheckpoint(seriesId, book.bookNumber);
    console.log("  Starting fresh ingest for this book");
  }

  const embedBatch = Number(process.env.EMBED_UPSERT_BATCH ?? 20);
  const delayMs = Number(process.env.EMBED_DELAY_MS ?? 1200);

  console.log("  Generating embeddings with gemini-embedding-001...");
  console.log(
    `  Pacing: batch ${embedBatch}, delay ${delayMs}ms (429s auto-retry with backoff)`,
  );

  for (let i = startIndex; i < chunks.length; i += embedBatch) {
    const slice = chunks.slice(i, i + embedBatch);
    const embeddings = await generateEmbeddingsBatch(
      slice.map((c) => c.content),
      Number(process.env.EMBED_BATCH_SIZE ?? 1),
      delayMs,
    );

    const rows = slice.map((chunk, j) => ({
      ...chunk,
      embedding: embeddings[j],
    }));

    const { error } = await supabase.from("book_chunks").upsert(rows, {
      onConflict: "series_id,book_number,chapter_number,chunk_index",
    });
    if (error) {
      await saveCheckpoint({
        seriesId,
        bookNumber: book.bookNumber,
        nextChunkIndex: i,
        totalChunks: chunks.length,
        updatedAt: new Date().toISOString(),
      });
      throw new Error(
        `Upsert failed at chunk ${i}: ${error.message}. Re-run ingest to resume.`,
      );
    }

    const nextIndex = Math.min(i + embedBatch, chunks.length);
    await saveCheckpoint({
      seriesId,
      bookNumber: book.bookNumber,
      nextChunkIndex: nextIndex,
      totalChunks: chunks.length,
      updatedAt: new Date().toISOString(),
    });
    console.log(`  Progress: ${nextIndex} / ${chunks.length} chunks upserted`);
  }

  await clearCheckpoint(seriesId, book.bookNumber);
  console.log(`  Done: ${book.title}`);
}

function assertEmbeddingAuth() {
  const useVertex =
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" ||
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "1";

  if (useVertex) {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      throw new Error("Set GOOGLE_CLOUD_PROJECT for Vertex ingest");
    }
    return;
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("Set GOOGLE_GENERATIVE_AI_API_KEY in .env or .env.local");
  }
}

async function main() {
  assertEmbeddingAuth();

  const options = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest();

  for (const series of manifest.series) {
    if (options.seriesFilter && series.id !== options.seriesFilter) continue;
    console.log(`Ingesting series: ${series.title} (${series.id})`);

    const books = options.bookNumbers?.length
      ? series.books.filter((b) => options.bookNumbers!.includes(b.bookNumber))
      : series.books;

    if (books.length === 0) {
      console.warn("  No matching books to ingest.");
      continue;
    }

    for (const book of books) {
      await ingestBook(series.id, book, { fresh: options.fresh });
    }
  }

  console.log("\nIngestion complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
