import { createGoogleGenAI } from "@/lib/embeddings";
import type { CatalogSeries } from "@/lib/catalog";
import type { RetrievedChunk } from "@/lib/types";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function laterBookTitles(
  series: CatalogSeries | undefined,
  maxBook: number,
): string[] {
  if (!series) return [];
  return series.books
    .filter((book) => book.number > maxBook)
    .map((book) => book.title);
}

export function containsLaterBookTitle(text: string, titles: string[]): boolean {
  if (titles.length === 0) return false;
  const haystack = text.toLowerCase();
  return titles.some((title) => haystack.includes(title.toLowerCase()));
}

export function allowedBookTitles(
  series: CatalogSeries | undefined,
  maxBook: number,
): string[] {
  if (!series) return [];
  return series.books
    .filter((book) => book.number <= maxBook)
    .map((book) => book.title);
}

export function buildWebSearchQuery(
  query: string,
  series: CatalogSeries | undefined,
  maxBook: number,
): string {
  const allowed = allowedBookTitles(series, maxBook);
  const later = laterBookTitles(series, maxBook);
  const seriesHint = series
    ? `${series.title} by ${series.author}`
    : "the book series";
  const through =
    allowed.length > 0
      ? `only using publicly known facts from: ${allowed.join(", ")}`
      : `only using facts established through book ${maxBook}`;
  const exclude =
    later.length > 0 ? ` Do not use later books (${later.join(", ")}).` : "";

  return [
    `For a spoiler-free catch-up about ${seriesHint}, ${through}.`,
    exclude.trim(),
    `Question: ${query}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function toWebChunk(
  index: number,
  seriesId: string,
  title: string,
  content: string,
  url?: string,
): RetrievedChunk {
  return {
    id: -(index + 1),
    series_id: seriesId,
    book_number: 0,
    chapter_number: 0,
    chunk_index: index,
    content,
    source: "web",
    title: title || "Web source",
    url,
  };
}

function filterSpoilerResults(
  chunks: RetrievedChunk[],
  laterTitles: string[],
): RetrievedChunk[] {
  return chunks.filter((chunk) => {
    const blob = `${chunk.title ?? ""} ${chunk.content} ${chunk.url ?? ""}`;
    return !containsLaterBookTitle(blob, laterTitles);
  });
}

type TavilyHit = {
  title?: string;
  url?: string;
  content?: string;
};

async function searchTavily(
  query: string,
  seriesId: string,
  laterTitles: string[],
  signal: AbortSignal,
): Promise<RetrievedChunk[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env("TAVILY_API_KEY"),
      query,
      search_depth: "basic",
      include_answer: false,
      max_results: envNumber("CRAG_WEB_RESULTS", 5),
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Tavily ${response.status} ${response.statusText} ${detail}`.trim(),
    );
  }

  const payload = (await response.json()) as { results?: TavilyHit[] };
  const chunks: RetrievedChunk[] = [];

  for (const hit of payload.results ?? []) {
    const content = hit.content?.trim();
    if (!content) continue;
    chunks.push(
      toWebChunk(chunks.length, seriesId, hit.title ?? "", content, hit.url),
    );
  }

  return filterSpoilerResults(chunks, laterTitles);
}

async function searchGemini(
  query: string,
  seriesId: string,
  laterTitles: string[],
  signal: AbortSignal,
): Promise<RetrievedChunk[]> {
  const ai = createGoogleGenAI();
  const response = await ai.models.generateContent({
    model: env("GEMINI_CRAG_MODEL") ?? "gemini-2.5-flash-lite",
    contents: [
      "Extract spoiler-safe passages that help answer the question.",
      "Quote or paraphrase only facts that are established in the allowed books.",
      "If search results describe later-book plot, ignore them.",
      "",
      query,
    ].join("\n"),
    config: {
      abortSignal: signal,
      temperature: 0,
      tools: [{ googleSearch: {} }],
    },
  });

  const metadata = response.candidates?.[0]?.groundingMetadata;
  const chunks: RetrievedChunk[] = [];
  const webChunks = metadata?.groundingChunks ?? [];
  const supports = metadata?.groundingSupports ?? [];

  if (supports.length > 0) {
    for (const support of supports) {
      const text = support.segment?.text?.trim();
      if (!text) continue;
      const index = support.groundingChunkIndices?.[0] ?? 0;
      const web = webChunks[index]?.web;
      chunks.push(
        toWebChunk(
          chunks.length,
          seriesId,
          web?.title ?? "Web source",
          text,
          web?.uri,
        ),
      );
    }
  } else {
    for (const grounding of webChunks) {
      const web = grounding.web;
      if (!web?.title && !web?.uri) continue;
      chunks.push(
        toWebChunk(
          chunks.length,
          seriesId,
          web.title ?? "Web source",
          web.title ?? web.uri ?? "Web source",
          web.uri,
        ),
      );
    }
  }

  const synthesized = response.text?.trim();
  if (chunks.length === 0 && synthesized) {
    chunks.push(toWebChunk(0, seriesId, "Web search notes", synthesized));
  }

  return filterSpoilerResults(chunks, laterTitles);
}

/**
 * Last-resort CRAG fallback. Prefer Tavily when a key is present (snippets),
 * otherwise Gemini Google Search. Later-book titles are stripped before the
 * passages can enter the answer context.
 */
export async function webSearchForQuery(options: {
  query: string;
  seriesId: string;
  maxBook: number;
  series?: CatalogSeries;
}): Promise<RetrievedChunk[]> {
  const laterTitles = laterBookTitles(options.series, options.maxBook);
  const searchQuery = buildWebSearchQuery(
    options.query,
    options.series,
    options.maxBook,
  );

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    envNumber("CRAG_WEB_TIMEOUT_MS", 10_000),
  );

  try {
    if (env("TAVILY_API_KEY")) {
      return await searchTavily(
        searchQuery,
        options.seriesId,
        laterTitles,
        controller.signal,
      );
    }
    return await searchGemini(
      searchQuery,
      options.seriesId,
      laterTitles,
      controller.signal,
    );
  } finally {
    clearTimeout(timer);
  }
}
