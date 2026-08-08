import { generateEmbedding } from "@/lib/embeddings";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { BookChunk } from "@/lib/types";

export async function getSpoilerFreeContext(
  query: string,
  seriesId: string,
  maxBook: number,
  options?: {
    matchThreshold?: number;
    matchCount?: number;
  },
): Promise<BookChunk[]> {
  const queryEmbedding = await generateEmbedding(query);
  const db = createServiceSupabaseClient();

  // Hard filter: book_number must be <= maxBook (enforced in RPC)
  const { data, error } = await db.rpc("match_book_chunks", {
    query_embedding: queryEmbedding,
    filter_series: seriesId,
    max_book_limit: maxBook,
    match_threshold: options?.matchThreshold ?? 0.7,
    match_count: options?.matchCount ?? 5,
  });

  if (error) {
    throw new Error(`match_book_chunks failed: ${error.message}`);
  }

  return (data ?? []) as BookChunk[];
}
