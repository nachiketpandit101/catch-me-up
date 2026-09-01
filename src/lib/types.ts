export type BookChunk = {
  id: number;
  series_id: string;
  book_number: number;
  chapter_number: number;
  chunk_index: number;
  content: string;
  similarity?: number;
};

/** A chunk carrying the scores that put it in the context window. */
export type RetrievedChunk = BookChunk & {
  bm25Score?: number;
  fusedScore?: number;
  /** 1-based rank per retriever that surfaced this chunk. */
  ranks?: Record<string, number>;
};

export type ChatRequestBody = {
  prompt: string;
  seriesId: string;
  maxBookProgress: number;
};
