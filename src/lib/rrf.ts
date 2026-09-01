/**
 * Reciprocal Rank Fusion.
 *
 *   RRF(d) = sum over retrievers m of  weight_m / (k + rank_m(d))
 *
 * Fusing on rank rather than score means dense cosine similarity and BM25 —
 * which live on incomparable scales — can be merged without normalization.
 */

export type FusionList<T> = {
  name: string;
  items: T[];
  weight?: number;
};

export type FusedResult<T> = {
  item: T;
  score: number;
  /** 1-based rank per retriever, absent when that retriever missed the item. */
  ranks: Record<string, number>;
};

export const DEFAULT_RRF_K = 60;

export function fuseByRRF<T>(
  lists: FusionList<T>[],
  keyOf: (item: T) => string | number,
  k: number = DEFAULT_RRF_K,
): FusedResult<T>[] {
  const fused = new Map<string | number, FusedResult<T>>();

  for (const list of lists) {
    const weight = list.weight ?? 1;

    list.items.forEach((item, index) => {
      const key = keyOf(item);
      const rank = index + 1;
      const existing = fused.get(key);

      if (existing) {
        existing.score += weight / (k + rank);
        existing.ranks[list.name] = rank;
        return;
      }

      fused.set(key, {
        item,
        score: weight / (k + rank),
        ranks: { [list.name]: rank },
      });
    });
  }

  return [...fused.values()].sort((a, b) => b.score - a.score);
}
