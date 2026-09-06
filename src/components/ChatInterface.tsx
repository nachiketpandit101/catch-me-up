"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { CatalogBook, CatalogSeries } from "@/lib/catalog";
import { SOURCES_HEADER, CRAG_HEADER, decodeCitations, decodeCragTrace, type Citation } from "@/lib/citations";
import type { CragTrace } from "@/lib/types";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  crag?: CragTrace | null;
};

type ChatInterfaceProps = {
  series: CatalogSeries;
};

function citationDetail(citation: Citation): string {
  const parts = [
    `${citation.chunkCount} chunk${citation.chunkCount === 1 ? "" : "s"}`,
  ];
  if (citation.bestRerankScore !== undefined) {
    parts.push(`rerank ${citation.bestRerankScore.toFixed(3)}`);
  }
  if (citation.bestSimilarity !== undefined) {
    parts.push(`similarity ${citation.bestSimilarity.toFixed(3)}`);
  }
  return parts.join(" · ");
}

export function ChatInterface({ series }: ChatInterfaceProps) {
  const storageKey = `catch-me-up:maxBookProgress:${series.id}`;
  const [maxBookProgress, setMaxBookProgress] = useState(
    series.books[series.books.length - 1]?.number ?? 1,
  );
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    const parsed = Number(stored);
    const maxBook = series.books[series.books.length - 1]?.number ?? 1;
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= maxBook) {
      setMaxBookProgress(parsed);
    }
  }, [series.books, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(maxBookProgress));
  }, [maxBookProgress, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setPrompt("");
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          seriesId: series.id,
          maxBookProgress,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error("No response stream from server");
      }

      // Sources arrive as a header, so they can be shown before the answer
      // finishes streaming.
      const citations = decodeCitations(response.headers.get(SOURCES_HEADER));
      const crag = decodeCragTrace(response.headers.get(CRAG_HEADER));
      if (citations.length > 0 || crag) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  citations: citations.length > 0 ? citations : message.citations,
                  crag: crag ?? message.crag,
                }
              : message,
          ),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        );
      }

      if (!fullText.trim()) {
        throw new Error(
          "Empty reply from Gemini. Check API quota / GEMINI_CHAT_MODEL in .env (try gemini-2.5-flash).",
        );
      }

      if (
        fullText.includes("RESOURCE_EXHAUSTED") ||
        fullText.includes("exceeded your current quota")
      ) {
        throw new Error(
          `Gemini quota exceeded. Set GEMINI_CHAT_MODEL to a model with available quota (gemini-2.5-flash or gemini-3-flash-preview). See https://ai.dev/rate-limit`,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages((prev) =>
        prev.filter(
          (m) => !(m.id === assistantId && m.content.length === 0),
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  const currentBook: CatalogBook =
    series.books.find((book) => book.number === maxBookProgress) ??
    series.books[0];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <Link
              href="/"
              className="text-xs uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--ink)]"
            >
              ← Library
            </Link>
            <p className="mt-2 font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)] sm:text-3xl">
              {series.title}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {series.author} · spoiler-bounded catch-up
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm text-[var(--muted)]">
            Current book progress
            <select
              value={maxBookProgress}
              onChange={(event) =>
                setMaxBookProgress(Number(event.target.value))
              }
              className="min-w-[14rem] rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
              disabled={isStreaming}
            >
              {series.books.map((book) => (
                <option key={book.number} value={book.number}>
                  Reading: Book {book.number} — {book.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-[var(--muted)]">
          Answers use only context from Book {currentBook.number} and earlier.
          Claims are cited back to retrieved chunks; nothing past your progress
          is retrieved.
        </p>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
          {messages.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)]/50 px-4 py-8 text-center text-[var(--muted)]">
              Ask who someone is, what just happened, or why a plot point
              matters — without spoilers past Book {maxBookProgress}.
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-8 self-end rounded-lg bg-[var(--accent)] px-4 py-3 text-[var(--accent-ink)]"
                  : "mr-8 self-start rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[var(--ink)]"
              }
            >
              <p className="mb-1 text-xs uppercase tracking-wide opacity-70">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">
                {message.content || (isStreaming ? "…" : "")}
              </p>

              {message.role === "assistant" &&
                ((message.citations && message.citations.length > 0) ||
                  message.crag) && (
                  <div className="mt-3 border-t border-[var(--line)] pt-2 text-xs text-[var(--muted)]">
                    {message.citations && message.citations.length > 0 && (
                      <p>
                        <span className="uppercase tracking-wide">Sources:</span>{" "}
                        {message.citations.map((citation, index) => (
                          <span
                            key={`${citation.label}:${citation.url ?? index}`}
                            title={citationDetail(citation)}
                          >
                            {index > 0 && " · "}
                            {citation.url ? (
                              <a
                                href={citation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
                              >
                                {citation.label}
                              </a>
                            ) : (
                              citation.label
                            )}
                          </span>
                        ))}
                      </p>
                    )}
                    {message.crag &&
                      (message.crag.usedExpansion ||
                        message.crag.usedWeb ||
                        message.crag.action === "refuse") && (
                        <p className="mt-1">
                          {message.crag.action === "refuse"
                            ? "Context was too weak to ground an answer."
                            : [
                                message.crag.usedExpansion
                                  ? "Re-retrieved with an expanded query"
                                  : null,
                                message.crag.usedWeb
                                  ? "spoiler-filtered web fallback"
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                      )}
                  </div>
                )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="mb-3 rounded-md border border-red-800/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <form
          onSubmit={onSubmit}
          className="sticky bottom-0 mt-auto flex items-center gap-2 bg-[var(--bg)]/95 pb-2 pt-3 backdrop-blur"
        >
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={`Ask about ${series.title}…`}
            className="flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)] outline-none ring-[var(--accent)] placeholder:text-[var(--muted)] focus:ring-2"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !prompt.trim()}
            aria-label="Send message"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStreaming ? (
              <span className="text-lg leading-none">…</span>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
