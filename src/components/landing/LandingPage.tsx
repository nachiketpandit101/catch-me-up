import Link from "next/link";
import { SERIES_CATALOG, getSeriesById } from "@/lib/catalog";
import { Reveal } from "./Reveal";
import { SpoilerLine } from "./SpoilerLine";
import {
  ClosingCta,
  FeatureGrid,
  HowItWorks,
  Pipeline,
  ShelfTeaser,
} from "./LandingSections";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#under-the-hood", label: "Under the hood" },
];

const STATS = [
  { value: "6", label: "books chunked, embedded, and searchable" },
  { value: "100%", label: "recall@12 on the Red Rising eval set" },
  { value: "0", label: "spoiler violations across that eval run" },
  { value: "2", label: "retrievers fused on every question" },
];

function BookMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 text-[var(--accent)]"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M12 6v6l2.2-1.6L16.4 12V6" />
    </svg>
  );
}

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const redRising = getSeriesById("red-rising");
  const books = redRising?.books ?? [];

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      {/* Warm glow drifting behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-64 left-1/2 h-[46rem] w-[46rem] -translate-x-1/2 animate-[drift_22s_ease-in-out_infinite] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(196,92,38,0.26) 0%, rgba(196,92,38,0) 68%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f3e6d4' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <header className="sticky top-0 z-20 border-b border-[var(--line)]/50 bg-[var(--bg)]/80 backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)] transition hover:text-[var(--accent)]"
          >
            <BookMark />
            Catch Me Up
          </Link>

          <div className="hidden items-center gap-7 text-sm text-[var(--muted)] md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition hover:text-[var(--ink)]"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {signedIn ? (
              <Link
                href="/library"
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] transition hover:brightness-110"
              >
                Open library
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-md px-3 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--ink)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] transition hover:brightness-110"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="relative z-[1] flex-1">
        <section className="mx-auto grid w-full max-w-5xl gap-14 px-5 pb-16 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-12">
          <div className="animate-[fade-up_0.7s_ease-out_both]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)]/60 px-3 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              Red Rising is live
            </span>

            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[2.75rem] leading-[1.02] tracking-tight text-[var(--ink)] sm:text-6xl">
              Remind me what
              <br />
              happened.{" "}
              <span className="bg-[linear-gradient(100deg,var(--accent),#e8a06a)] bg-clip-text text-transparent">
                Nothing after
                <br className="hidden sm:block" /> that.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
              Catch Me Up answers questions about the series you&apos;re reading
              using only the books you&apos;ve actually finished. Set your
              spoiler line, ask anything, and every answer comes back cited to
              the chapter it came from.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href={signedIn ? "/library" : "/signup"}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--accent-ink)] shadow-[0_14px_40px_-14px_rgba(196,92,38,0.9)] transition hover:brightness-110"
              >
                {signedIn ? "Open your library" : "Start catching up"}
                <span aria-hidden>→</span>
              </Link>
              <a
                href="#how-it-works"
                className="rounded-md border border-[var(--line)] px-5 py-3 text-sm text-[var(--muted)] transition hover:border-[var(--accent)]/60 hover:text-[var(--ink)]"
              >
                See how it works
              </a>
            </div>

            <p className="mt-5 text-xs text-[var(--muted)]">
              Answers are drawn from the books themselves — never a plot summary
              that assumes you finished the series.
            </p>
          </div>

          <div className="animate-[fade-up_0.7s_ease-out_0.18s_both]">
            <SpoilerLine books={books} />
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-5 sm:px-8">
          <Reveal>
            <dl className="grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.label} className="bg-[var(--bg)] px-5 py-6">
                  <dt className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
                    {stat.value}
                  </dt>
                  <dd className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <HowItWorks />
        <Pipeline />
        <FeatureGrid />
        <ShelfTeaser series={SERIES_CATALOG} />
        <ClosingCta signedIn={signedIn} />
      </main>

      <footer className="relative z-[1] border-t border-[var(--line)]/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-8 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="flex items-center gap-2">
            <BookMark />
            Catch Me Up — spoiler-bounded answers for book series
          </p>
          <p>Next.js · Supabase · Gemini</p>
        </div>
      </footer>
    </div>
  );
}
