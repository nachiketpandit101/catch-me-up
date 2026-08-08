export type BookChunk = {
  id: number;
  series_id: string;
  book_number: number;
  chapter_number: number;
  chunk_index: number;
  content: string;
  similarity?: number;
};

export type ChatRequestBody = {
  prompt: string;
  seriesId: string;
  maxBookProgress: number;
};
