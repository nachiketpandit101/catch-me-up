import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chunkChapters } from "../src/lib/ingest/chunk";
import { parseChapters } from "../src/lib/ingest/parse";
import { generateEmbeddingsBatch } from "../src/lib/embeddings";

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

async function ingestBook(
  seriesId: string,
  book: ManifestBook,
): Promise<void> {
  const filePath = path.join(process.cwd(), book.path);
  console.log(`\nReading ${book.title} (book ${book.bookNumber}) from ${book.path}`);

  const raw = await readFile(filePath, "utf8");
  const chapters = parseChapters(raw);
  console.log(`  Parsed ${chapters.length} chapters`);

  const chunks = chunkChapters(seriesId, book.bookNumber, chapters);
  console.log(`  Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    console.warn("  No chunks to embed; skipping");
    return;
  }

  console.log("  Generating embeddings with gemini-embedding-001...");
  console.log(
    "  (Slow paced for free-tier quotas; 429s will auto-retry with backoff.)",
  );
  const embeddings = await generateEmbeddingsBatch(
    chunks.map((c) => c.content),
  );

  const rows = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  const supabase = getSupabase();

  // Replace existing chunks for this book so re-ingest is idempotent
  const { error: deleteError } = await supabase
    .from("book_chunks")
    .delete()
    .eq("series_id", seriesId)
    .eq("book_number", book.bookNumber);

  if (deleteError) {
    throw new Error(`Failed to clear old chunks: ${deleteError.message}`);
  }

  const upsertBatchSize = 50;
  for (let i = 0; i < rows.length; i += upsertBatchSize) {
    const batch = rows.slice(i, i + upsertBatchSize);
    const { error } = await supabase.from("book_chunks").upsert(batch, {
      onConflict: "series_id,book_number,chapter_number,chunk_index",
    });
    if (error) {
      throw new Error(`Upsert failed at offset ${i}: ${error.message}`);
    }
    console.log(
      `  Upserted ${Math.min(i + upsertBatchSize, rows.length)} / ${rows.length}`,
    );
  }

  console.log(`  Done: ${book.title}`);
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("Set GOOGLE_GENERATIVE_AI_API_KEY in .env or .env.local");
  }

  const manifest = await loadManifest();
  const seriesFilter = process.argv[2];

  for (const series of manifest.series) {
    if (seriesFilter && series.id !== seriesFilter) continue;
    console.log(`Ingesting series: ${series.title} (${series.id})`);
    for (const book of series.books) {
      await ingestBook(series.id, book);
    }
  }

  console.log("\nIngestion complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
