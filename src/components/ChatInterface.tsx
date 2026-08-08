"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

const SERIES_ID = "red-rising";
const SERIES_TITLE = "Red Rising";
const BOOKS = [
  { number: 1, title: "Red Rising" },
  { number: 2, title: "Golden Son" },
] as const;

const STORAGE_KEY = "catch-me-up:maxBookProgress";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function ChatInterface() {
  const [maxBookProgress, setMaxBookProgress] = useState(2);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= BOOKS.length) {
      setMaxBookProgress(parsed);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(maxBookProgress));
  }, [maxBookProgress]);

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
          seriesId: SERIES_ID,
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

  const currentBook =
    BOOKS.find((book) => book.number === maxBookProgress) ?? BOOKS[0];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)] sm:text-3xl">
              Catch Me Up
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Spoiler-bounded refresher for {SERIES_TITLE}
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
              {BOOKS.map((book) => (
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
          Nothing past your progress is retrieved.
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
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="mb-3 rounded-md border border-red-800/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <form onSubmit={onSubmit} className="sticky bottom-0 mt-auto flex gap-2 bg-[var(--bg)]/95 pb-2 pt-3 backdrop-blur">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What happened with Darrow at the Institute?"
            className="flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)] outline-none ring-[var(--accent)] placeholder:text-[var(--muted)] focus:ring-2"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !prompt.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-3 font-medium text-[var(--accent-ink)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStreaming ? "…" : "Ask"}
          </button>
        </form>
      </main>
    </div>
  );
}
