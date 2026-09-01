import { generateEmbedding } from "@/lib/embeddings";
import { DEFAULT_RRF_K, fuseByRRF } from "@/lib/rrf";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { BookChunk, RetrievedChunk } from "@/lib/types";

type Supabase = ReturnType<typeof createServiceSupabaseClient>;

export type RetrievalOptions = {
  /** Candidates pulled from each retriever before fusion. */
  candidates?: number;
  /** Chunks returned after fusion. */
  finalCount?: number;
  matchThreshold?: number;
  rrfK?: number;
  denseWeight?: number;
  sparseWeight?: number;
};

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isDebug(): boolean {
  return process.env.RETRIEVAL_DEBUG === "true";
}

async function denseSearch(
  db: Supabase,
  query: string,
  seriesId: string,
  maxBook: number,
  limit: number,
  matchThreshold: number,
): Promise<BookChunk[]> {
  const queryEmbedding = await generateEmbedding(query);

  // Hard filter: book_number must be <= maxBook (enforced in RPC)
  const { data, error } = await db.rpc("match_book_chunks", {
    query_embedding: queryEmbedding,
    filter_series: seriesId,
    max_book_limit: maxBook,
    match_threshold: matchThreshold,
    match_count: limit,
  });

  if (error) {
    throw new Error(`match_book_chunks failed: ${error.message}`);
  }

  return (data ?? []) as BookChunk[];
}

async function sparseSearch(
  db: Supabase,
  query: string,
  seriesId: string,
  maxBook: number,
  limit: number,
): Promise<RetrievedChunk[]> {
  // Same spoiler bound as the dense path, enforced inside the RPC.
  const { data, error } = await db.rpc("bm25_book_chunks", {
    query_text: query,
    filter_series: seriesId,
    max_book_limit: maxBook,
    match_count: limit,
  });

  if (error) {
    throw new Error(`bm25_book_chunks failed: ${error.message}`);
  }

  const rows = (data ?? []) as (BookChunk & { score?: number })[];
  return rows.map(({ score, ...chunk }) => ({ ...chunk, bm25Score: score }));
}

/**
 * Hybrid retrieval: dense vector search for paraphrased questions, BM25 for
 * exact names and rare terms, merged with Reciprocal Rank Fusion.
 *
 * Both retrievers apply the `book_number <= maxBook` filter in SQL, so no
 * chunk past the reader's progress can enter the candidate pool.
 */
export async function getSpoilerFreeContext(
  query: string,
  seriesId: string,
  maxBook: number,
  options?: RetrievalOptions,
): Promise<RetrievedChunk[]> {
  const candidates = Math.floor(
    options?.candidates ?? envNumber("RETRIEVAL_CANDIDATES", 40),
  );
  const finalCount = Math.floor(
    options?.finalCount ?? envNumber("RETRIEVAL_FINAL_CHUNKS", 12),
  );
  const matchThreshold =
    options?.matchThreshold ?? envNumber("DENSE_MATCH_THRESHOLD", 0.3);
  const rrfK = options?.rrfK ?? envNumber("RRF_K", DEFAULT_RRF_K);

  const db = createServiceSupabaseClient();

  const [dense, sparse] = await Promise.all([
    denseSearch(db, query, seriesId, maxBook, candidates, matchThreshold),
    // Keyword search is an enhancement; if migration 003 has not been applied
    // yet, fall back to dense-only rather than failing the request.
    sparseSearch(db, query, seriesId, maxBook, candidates).catch((error) => {
      console.warn(`Sparse retrieval unavailable: ${(error as Error).message}`);
      return [] as RetrievedChunk[];
    }),
  ]);

  const fused = fuseByRRF(
    [
      { name: "dense", items: dense, weight: options?.denseWeight ?? 1 },
      { name: "sparse", items: sparse, weight: options?.sparseWeight ?? 1 },
    ],
    (chunk) => chunk.id,
    rrfK,
  );

  const denseById = new Map(dense.map((chunk) => [chunk.id, chunk]));
  const sparseById = new Map(sparse.map((chunk) => [chunk.id, chunk]));

  const results: RetrievedChunk[] = fused
    .slice(0, finalCount)
    .map(({ item, score, ranks }) => ({
      ...item,
      similarity: denseById.get(item.id)?.similarity,
      bm25Score: sparseById.get(item.id)?.bm25Score,
      fusedScore: score,
      ranks,
    }));

  if (isDebug()) {
    console.log(
      `[retrieval] "${query}" dense=${dense.length} sparse=${sparse.length} fused=${fused.length} returned=${results.length}`,
    );
    for (const chunk of results) {
      console.log(
        `  b${chunk.book_number} ch${chunk.chapter_number}#${chunk.chunk_index} ` +
          `rrf=${chunk.fusedScore?.toFixed(5)} ranks=${JSON.stringify(chunk.ranks)} ` +
          `cos=${chunk.similarity?.toFixed(3) ?? "-"} bm25=${chunk.bm25Score?.toFixed(2) ?? "-"}`,
      );
    }
  }

  return results;
}
