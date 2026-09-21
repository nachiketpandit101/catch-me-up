"use client";

import { Fragment, useId, useState } from "react";
import type { CatalogBook } from "@/lib/catalog";

const SPINE_ACCENT = "#9b2c1f";

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Spine({ book, unlocked }: { book: CatalogBook; unlocked: boolean }) {
  return (
    <div
      className={`relative flex h-40 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[3px] transition-all duration-500 ease-out sm:h-48 sm:w-12 ${
        unlocked
          ? "shadow-[3px_6px_18px_rgba(0,0,0,0.45)]"
          : "translate-y-1 saturate-0 opacity-45"
      }`}
      style={{
        background: unlocked
          ? `linear-gradient(160deg, ${SPINE_ACCENT} 0%, color-mix(in srgb, ${SPINE_ACCENT} 62%, #150c08) 100%)`
          : "linear-gradient(160deg, #2b211a 0%, #1a120d 100%)",
      }}
      title={unlocked ? book.title : `${book.title} — beyond your progress`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-black/30"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 2px, rgba(255,255,255,0.05) 2px 3px)",
        }}
      />

      <span
        className={`relative z-[1] whitespace-nowrap font-[family-name:var(--font-display)] text-[0.68rem] tracking-tight transition duration-500 sm:text-xs ${
          unlocked ? "text-[#fff4e8]" : "text-[var(--muted)] blur-[2.5px]"
        }`}
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {book.title}
      </span>

      {!unlocked && (
        <LockIcon className="absolute bottom-2 left-1/2 z-[2] size-3.5 -translate-x-1/2 text-[var(--muted)]" />
      )}
    </div>
  );
}

export function SpoilerLine({ books }: { books: CatalogBook[] }) {
  const lastBook = books[books.length - 1]?.number ?? 1;
  const [progress, setProgress] = useState(Math.min(2, lastBook));
  const sliderId = useId();

  const lockedCount = lastBook - progress;
  const currentBook = books.find((book) => book.number === progress);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]/70 p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:p-7">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--muted)]">
          Try it — drag your progress
        </p>
        <p className="text-xs text-[var(--muted)]">Red Rising</p>
      </div>

      {/* The shelf. Everything past the line is dimmed and locked. */}
      <div className="mt-6">
        <div className="flex items-end justify-center gap-2 sm:gap-2.5">
          {books.map((book) => (
            <Fragment key={book.number}>
              <Spine book={book} unlocked={book.number <= progress} />
              {book.number === progress && lockedCount > 0 && (
                <div className="relative mx-1 self-stretch">
                  <span
                    aria-hidden
                    className="block h-full w-[2px] rounded-full bg-[linear-gradient(180deg,transparent,var(--accent),transparent)] shadow-[0_0_16px_3px_rgba(196,92,38,0.55)]"
                  />
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.6rem] uppercase tracking-[0.2em] text-[var(--accent)]">
                    Spoiler line
                  </span>
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <div
          aria-hidden
          className="mt-3 h-2.5 rounded-sm bg-[linear-gradient(180deg,#6b4a32_0%,#3d291c_55%,#2a1b12_100%)] shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
        />
      </div>

      <label htmlFor={sliderId} className="mt-7 block">
        <span className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-[var(--muted)]">I&apos;ve finished</span>
          <span className="font-[family-name:var(--font-display)] text-[var(--ink)]">
            Book {progress} — {currentBook?.title}
          </span>
        </span>
        <input
          id={sliderId}
          type="range"
          min={1}
          max={lastBook}
          step={1}
          value={progress}
          onChange={(event) => setProgress(Number(event.target.value))}
          className="mt-3 w-full cursor-pointer accent-[var(--accent)]"
        />
        <span
          aria-hidden
          className="mt-1 flex justify-between px-[2px] text-[0.65rem] text-[var(--muted)]"
        >
          {books.map((book) => (
            <span key={book.number}>{book.number}</span>
          ))}
        </span>
      </label>

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1 text-[var(--ink)]">
          Searchable · Books 1–{progress}
        </span>
        <span className="rounded-full border border-[var(--line)] bg-[var(--surface)]/70 px-3 py-1 text-[var(--muted)]">
          {lockedCount > 0
            ? `Never retrieved · Books ${progress + 1}–${lastBook}`
            : "Nothing locked · you're current"}
        </span>
      </div>

      {/* Two illustrative answers: one inside the line, one past it. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/60 p-4">
          <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            <span className="size-1.5 rounded-full bg-[var(--accent)]" />
            Answered
          </p>
          <p className="mt-3 text-sm text-[var(--ink)]">
            &ldquo;Remind me who Sevro is.&rdquo;
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            The runt of the Institute — feral, unreadable, and the first to
            follow Darrow. He leads the Howlers, the wolf-cloaked band built
            from the students nobody else wanted.
          </p>
          <p className="mt-3 border-t border-[var(--line)] pt-2 text-[0.7rem] text-[var(--muted)]">
            Sources: Book 1, Ch. 24 · Book 1, Ch. 31
          </p>
        </div>

        <div
          key={progress}
          className="animate-[fade-up_0.4s_ease-out_both] rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)]/40 p-4"
        >
          <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            <LockIcon className="size-3" />
            {lockedCount > 0 ? "Refused" : "All clear"}
          </p>
          <p className="mt-3 text-sm text-[var(--ink)]">
            &ldquo;What happens to Darrow in the last book?&rdquo;
          </p>
          {lockedCount > 0 ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                I couldn&apos;t find that in the books you&apos;ve read through
                Book {progress}. If it hasn&apos;t come up yet, I won&apos;t
                spoil it.
              </p>
              <p className="mt-3 border-t border-[var(--line)] pt-2 text-[0.7rem] text-[var(--muted)]">
                0 passages retrieved from Books {progress + 1}–{lastBook}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                You&apos;ve read the whole shelf, so nothing is off limits.
                Every book is back in the retrieval window.
              </p>
              <p className="mt-3 border-t border-[var(--line)] pt-2 text-[0.7rem] text-[var(--muted)]">
                Searching Books 1–{lastBook}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
