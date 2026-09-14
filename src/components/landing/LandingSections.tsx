import Link from "next/link";
import type { ReactNode } from "react";
import type { CatalogSeries } from "@/lib/catalog";
import { Reveal } from "./Reveal";

function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-[var(--accent)]">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-[var(--ink)] sm:text-4xl">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">
          {lead}
        </p>
      )}
    </div>
  );
}

const STEPS = [
  {
    title: "Pick your series",
    body: "Each book is split into chapter-aware chunks, embedded, and stored with its book number attached to every single passage.",
  },
  {
    title: "Draw your spoiler line",
    body: "Tell it the last book you finished. That number becomes a filter in the query itself, so later chapters are never fetched — not merely ignored.",
  },
  {
    title: "Ask like you'd ask a friend",
    body: "Who is that again? Why do these two hate each other? What did I miss? Answers stream back with the chapters they came from.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8 sm:py-28"
    >
      <Reveal>
        <SectionHeading
          eyebrow="How it works"
          title="Three steps, then you're reading again"
          lead="No re-skimming three books. No wiki tabs you have to close the second a section header spoils something."
        />
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Reveal key={step.title} delay={index * 110}>
            <div className="h-full rounded-xl border border-[var(--line)] bg-[var(--panel)]/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-[var(--accent)]/50">
              <span className="font-[family-name:var(--font-display)] text-4xl text-[var(--accent)]/70">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {step.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const PIPELINE = [
  {
    label: "Retrieve",
    body: "Vector similarity and BM25 keyword search run in parallel, both bounded to your books.",
  },
  {
    label: "Fuse",
    body: "Reciprocal Rank Fusion merges the two rankings into a single ordered list.",
  },
  {
    label: "Rerank",
    body: "A cross-encoder re-scores the survivors on true relevance to your question.",
  },
  {
    label: "Correct",
    body: "CRAG grades every passage. Too weak? Expand the query, then a filtered web search, then decline.",
  },
  {
    label: "Ground",
    body: "Any sentence without a citation to retrieved text is cut before it reaches you.",
  },
];

export function Pipeline() {
  return (
    <section
      id="under-the-hood"
      className="relative border-y border-[var(--line)]/60 bg-[var(--panel)]/30"
    >
      <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal>
          <SectionHeading
            eyebrow="Under the hood"
            title="What happens between your question and the answer"
            lead="Five stages, all of them spoiler-bounded. The last one is the reason you can trust the first four."
          />
        </Reveal>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((stage, index) => (
            <li key={stage.label} className="h-full">
              <Reveal delay={index * 90} className="h-full">
                <div className="relative h-full rounded-lg border border-[var(--line)] bg-[var(--surface)]/50 p-5">
                  <span
                    aria-hidden
                    className="absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] opacity-60"
                  />
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                    Step {index + 1}
                  </p>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                    {stage.label}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    {stage.body}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: "A boundary, not a suggestion",
    body: "Your progress becomes a condition in the database query. The model is never handed a passage it shouldn't have, so it can't leak one.",
  },
  {
    title: "Retrieval that corrects itself",
    body: "When the first pass comes back thin, CRAG rewrites your question and retrieves again before it commits to an answer.",
  },
  {
    title: "Cited down to the chapter",
    body: "Claims arrive labelled — Book 2, Ch. 14 — so you can go reread the moment yourself instead of taking its word for it.",
  },
  {
    title: "Uncited claims get cut",
    body: "A grounding pass deletes any sentence that isn't backed by retrieved text. Invented details don't survive the trip to your screen.",
  },
  {
    title: "Comfortable saying no",
    body: "If the books you've read don't cover it, you get told so. A refusal beats a confident guess when spoilers are the failure mode.",
  },
  {
    title: "Web fallback, still spoiler-safe",
    body: "For gaps the text can't fill, a web search runs — and any result naming a book you haven't reached is dropped before it's read.",
  },
];

export function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <SectionHeading
          eyebrow="Why it's safe"
          title="Built so a spoiler has nowhere to sneak through"
        />
      </Reveal>

      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal key={feature.title} delay={(index % 3) * 90}>
            <div className="group h-full bg-[var(--bg)] p-6 transition duration-300 hover:bg-[var(--panel)]">
              <h3 className="font-[family-name:var(--font-display)] text-lg leading-snug text-[var(--ink)]">
                {feature.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
                {feature.body}
              </p>
              <span
                aria-hidden
                className="mt-4 block h-px w-8 bg-[var(--accent)] opacity-40 transition-all duration-300 group-hover:w-16 group-hover:opacity-90"
              />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function ShelfTeaser({ series }: { series: CatalogSeries[] }) {
  return (
    <section className="relative border-y border-[var(--line)]/60 bg-[var(--panel)]/30">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <Reveal>
          <SectionHeading
            eyebrow="The shelf"
            title="Red Rising is on the shelf today"
            lead="Six books, chunked and indexed end to end. Adding a series is one ingest command, so the shelf grows as fast as the books come in."
          />
          <Link
            href="/library"
            className="mt-8 inline-flex items-center gap-2 text-sm text-[var(--accent)] transition hover:brightness-125"
          >
            Browse the library
            <span aria-hidden>→</span>
          </Link>
        </Reveal>

        <Reveal delay={140}>
          <div className="flex items-end justify-center gap-3 sm:gap-4">
            {series.map((item) => (
              <div
                key={item.id}
                className="flex h-52 w-32 flex-col justify-between rounded-sm px-3 py-4 shadow-[4px_10px_26px_rgba(0,0,0,0.5)] transition duration-300 hover:-translate-y-2"
                style={{
                  background: `linear-gradient(160deg, ${item.accent} 0%, color-mix(in srgb, ${item.accent} 68%, #1a100c) 100%)`,
                }}
              >
                <div>
                  <p className="font-[family-name:var(--font-display)] text-lg leading-tight text-[#fff4e8]">
                    {item.title}
                  </p>
                  <p className="mt-2 text-[0.65rem] uppercase tracking-[0.14em] text-[#fff4e8]/75">
                    {item.author}
                  </p>
                </div>
                <p className="text-[0.7rem] text-[#fff4e8]/80">
                  {item.books.length} books indexed
                </p>
              </div>
            ))}

            <div className="flex h-40 w-24 items-center justify-center rounded-sm border border-dashed border-[var(--line)] px-3 text-center text-[0.7rem] leading-snug text-[var(--muted)]">
              More series ingesting
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-32">
      <Reveal>
        <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-[var(--ink)] sm:text-5xl">
          Pick up exactly where you left off
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)]">
          Set your spoiler line once and ask whatever you&apos;ve forgotten. The
          next book is waiting, and nothing in it gets ruined on the way there.
        </p>
        <Link
          href={signedIn ? "/library" : "/signup"}
          className="mt-9 inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-6 py-3.5 text-sm font-medium text-[var(--accent-ink)] shadow-[0_14px_40px_-12px_rgba(196,92,38,0.8)] transition hover:brightness-110"
        >
          {signedIn ? "Open your library" : "Start catching up"}
          <span aria-hidden>→</span>
        </Link>
      </Reveal>
    </section>
  );
}
