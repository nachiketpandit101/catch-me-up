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
  rerankScore?: number;
  /** Post-retrieval grader score in [0, 1]. */
  gradeScore?: number;
  /** 1-based rank per retriever that surfaced this chunk. */
  ranks?: Record<string, number>;
  /** Corpus chunks are the default; web fallbacks are tagged explicitly. */
  source?: "corpus" | "web";
  url?: string;
  title?: string;
};

export type CragAction = "use" | "expand" | "web" | "refuse";

export type CragTrace = {
  action: CragAction;
  confidence: number;
  usedExpansion: boolean;
  usedWeb: boolean;
  expandedQuery?: string;
  graded: number;
  relevant: number;
};

export type ChatRequestBody = {
  prompt: string;
  seriesId: string;
  maxBookProgress: number;
};
