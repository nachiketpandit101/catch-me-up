"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { searchSeries, type CatalogSeries } from "@/lib/catalog";

function SeriesSpine({ series }: { series: CatalogSeries }) {
  return (
    <Link
      href={`/series/${series.id}`}
      className="group relative flex h-56 w-[7.5rem] shrink-0 flex-col justify-between overflow-hidden rounded-sm px-3 py-4 text-left shadow-[4px_8px_24px_rgba(0,0,0,0.45)] transition duration-300 ease-out hover:-translate-y-2 hover:shadow-[6px_14px_28px_rgba(0,0,0,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:h-64 sm:w-36"
      style={{
        background: `linear-gradient(160deg, ${series.accent} 0%, color-mix(in srgb, ${series.accent} 70%, #1a100c) 100%)`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-black/25"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 2px, rgba(255,255,255,0.04) 2px 3px)",
        }}
      />
      <div className="relative z-[1]">
        <p className="font-[family-name:var(--font-display)] text-lg leading-tight text-[#fff4e8] sm:text-xl">
          {series.title}
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[#fff4e8]/75">
          {series.author}
        </p>
      </div>
      <p className="relative z-[1] text-xs text-[#fff4e8]/80">
        {series.books.length} book{series.books.length === 1 ? "" : "s"} available
      </p>
    </Link>
  );
}

function ShelfRow({ series }: { series: CatalogSeries[] }) {
  if (series.length === 0) {
    return (
      <p className="py-10 text-center text-[var(--muted)]">
        No series match that search. Try another title or author.
      </p>
    );
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-end justify-center gap-4 px-2 pb-3 sm:justify-start sm:gap-5">
        {series.map((item, index) => (
          <div
            key={item.id}
            className="animate-[shelf-in_0.55s_ease-out_both]"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <SeriesSpine series={item} />
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="h-3 rounded-sm bg-[linear-gradient(180deg,#6b4a32_0%,#3d291c_55%,#2a1b12_100%)] shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
      />
      <div
        aria-hidden
        className="mx-1 h-2 rounded-b-sm bg-[#1c120c]/80"
      />
    </div>
  );
}

export function LibraryHome() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchSeries(query), [query]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f3e6d4' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <header className="relative z-[1] mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6 sm:px-8">
        <p className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)] sm:text-2xl">
          Catch Me Up
        </p>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
          Spoiler-free shelves
        </p>
      </header>

      <main className="relative z-[1] mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <section className="max-w-2xl">
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl">
            Catch Me Up
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            Browse the shelves, pick your series, and get a refresher that stops
            exactly where you stopped reading.
          </p>

          <label className="mt-8 block">
            <span className="sr-only">Search series</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search series, author, or title…"
              className="w-full max-w-xl rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-4 py-3.5 text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none ring-[var(--accent)] transition placeholder:text-[var(--muted)] focus:ring-2"
              autoComplete="off"
            />
          </label>
        </section>

        <section className="mt-14 sm:mt-20">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
              On the shelf
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {results.length} series
            </p>
          </div>
          <ShelfRow series={results} />
        </section>
      </main>
    </div>
  );
}
