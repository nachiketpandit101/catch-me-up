/**
 * Retrieval-only evaluation. No answers are generated, so this measures the
 * retriever in isolation and costs one query embedding per question (cached
 * across sweep combinations).
 *
 *   npx tsx scripts/eval-retrieval.ts
 *   npx tsx scripts/eval-retrieval.ts --threshold 0.2,0.3,0.4 --candidates 20,40
 *   npx tsx scripts/eval-retrieval.ts --no-rerank --case b1-
 */
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateEmbedding } from "../src/lib/embeddings";
import { getSpoilerFreeContext } from "../src/lib/retrieval";
import type { RetrievedChunk } from "../src/lib/types";

config({ path: ".env.local" });
config({ path: ".env" });

type EvalCase = {
  id: string;
  question: string;
  progress: number;
  expect?: { book: number; keywords: string[]; chapters: number[] };
  refusal?: { answerBook: number; keywords: string[] };
};

type EvalSet = { seriesId: string; cases: EvalCase[] };

type Combo = {
  candidates: number;
  finalCount: number;
  matchThreshold: number;
  rrfK: number;
};

type CaseResult = {
  id: string;
  isRefusal: boolean;
  firstHitRank: number | null;
  keywordHit: boolean;
  topSimilarity: number | null;
  spoilerViolations: number;
  retrieved: number;
  ms: number;
};

/**
 * Accepts `--flag a,b,c` and `--flag a b c`. PowerShell expands an unquoted
 * comma list before the script ever sees it, so both spellings must work.
 */
function parseList(argv: string[], flag: string): string[] | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;

  const values: string[] = [];
  for (let i = index + 1; i < argv.length; i++) {
    if (argv[i].startsWith("--")) break;
    values.push(...argv[i].split(/[,\s]+/).filter(Boolean));
  }

  return values.length > 0 ? values : undefined;
}

function parseNumbers(argv: string[], flag: string, fallback: number[]): number[] {
  const raw = parseList(argv, flag);
  if (!raw) return fallback;
  const parsed = raw.map(Number).filter((n) => Number.isFinite(n));
  return parsed.length > 0 ? parsed : fallback;
}

function parseSingle(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function containsAll(text: string, keywords: string[]): boolean {
  const haystack = text.toLowerCase();
  return keywords.every((keyword) => haystack.includes(keyword.toLowerCase()));
}

function evaluateCase(
  testCase: EvalCase,
  chunks: RetrievedChunk[],
  ms: number,
): CaseResult {
  const spoilerViolations = chunks.filter(
    (chunk) => chunk.book_number > testCase.progress,
  ).length;

  const similarities = chunks
    .map((chunk) => chunk.similarity)
    .filter((value): value is number => typeof value === "number");
  const topSimilarity = similarities.length > 0 ? Math.max(...similarities) : null;

  if (testCase.refusal) {
    return {
      id: testCase.id,
      isRefusal: true,
      firstHitRank: null,
      // A refusal case "leaks" if retrieval surfaced text that answers it.
      keywordHit: chunks.some((chunk) =>
        containsAll(chunk.content, testCase.refusal!.keywords),
      ),
      topSimilarity,
      spoilerViolations,
      retrieved: chunks.length,
      ms,
    };
  }

  const expected = testCase.expect!;
  const hitIndex = chunks.findIndex(
    (chunk) =>
      chunk.book_number === expected.book &&
      expected.chapters.includes(chunk.chapter_number),
  );

  return {
    id: testCase.id,
    isRefusal: false,
    firstHitRank: hitIndex === -1 ? null : hitIndex + 1,
    keywordHit: chunks.some((chunk) =>
      containsAll(chunk.content, expected.keywords),
    ),
    topSimilarity,
    spoilerViolations,
    retrieved: chunks.length,
    ms,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function summarize(combo: Combo, results: CaseResult[]) {
  const answerable = results.filter((result) => !result.isRefusal);
  const refusals = results.filter((result) => result.isRefusal);

  const recallAt = (k: number) =>
    answerable.filter(
      (result) => result.firstHitRank !== null && result.firstHitRank <= k,
    ).length / Math.max(answerable.length, 1);

  const mrr = mean(
    answerable.map((result) =>
      result.firstHitRank ? 1 / result.firstHitRank : 0,
    ),
  );

  const answerableTop = answerable
    .map((result) => result.topSimilarity)
    .filter((value): value is number => value !== null);
  const refusalTop = refusals
    .map((result) => result.topSimilarity)
    .filter((value): value is number => value !== null);

  const spoilerViolations = results.reduce(
    (sum, result) => sum + result.spoilerViolations,
    0,
  );

  console.log(
    `\ncandidates=${combo.candidates} final=${combo.finalCount} threshold=${combo.matchThreshold} rrfK=${combo.rrfK}`,
  );
  console.log(
    `  answerable (${answerable.length}): recall@1=${pct(recallAt(1))} recall@5=${pct(recallAt(5))} ` +
      `recall@${combo.finalCount}=${pct(recallAt(combo.finalCount))} MRR=${mrr.toFixed(3)}`,
  );
  console.log(
    `  keyword recall: answerable=${pct(
      answerable.filter((r) => r.keywordHit).length / Math.max(answerable.length, 1),
    )}  misses=${answerable.filter((r) => r.firstHitRank === null).length}`,
  );
  console.log(
    `  top cosine: answerable mean=${mean(answerableTop).toFixed(3)}  ` +
      `refusal mean=${mean(refusalTop).toFixed(3)}  ` +
      `gap=${(mean(answerableTop) - mean(refusalTop)).toFixed(3)}`,
  );
  console.log(
    `  refusal (${refusals.length}): leaked answer text=${refusals.filter((r) => r.keywordHit).length}  ` +
      `empty results=${refusals.filter((r) => r.retrieved === 0).length}`,
  );
  console.log(
    `  SPOILER VIOLATIONS: ${spoilerViolations} ${spoilerViolations === 0 ? "(clean)" : "<-- BUG"}`,
  );
  console.log(`  mean latency: ${Math.round(mean(results.map((r) => r.ms)))}ms`);

  const worst = answerable
    .filter((result) => result.firstHitRank === null)
    .map((result) => result.id);
  if (worst.length > 0) {
    console.log(`  no expected chapter retrieved: ${worst.join(", ")}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--no-rerank")) {
    process.env.RERANK_PROVIDER = "none";
  }

  const evalSet = JSON.parse(
    await readFile(path.join(process.cwd(), "eval", "red-rising.json"), "utf8"),
  ) as EvalSet;

  const filter = parseSingle(argv, "--case");
  const cases = evalSet.cases.filter(
    (testCase) => !filter || testCase.id.includes(filter),
  );

  const candidatesList = parseNumbers(argv, "--candidates", [40]);
  const finalList = parseNumbers(argv, "--final", [12]);
  const thresholdList = parseNumbers(argv, "--threshold", [0.3]);
  const rrfKList = parseNumbers(argv, "--rrf-k", [60]);
  const concurrency = parseNumbers(argv, "--concurrency", [4])[0];

  const combos: Combo[] = [];
  for (const candidates of candidatesList) {
    for (const finalCount of finalList) {
      for (const matchThreshold of thresholdList) {
        for (const rrfK of rrfKList) {
          combos.push({ candidates, finalCount, matchThreshold, rrfK });
        }
      }
    }
  }

  console.log(
    `${cases.length} cases x ${combos.length} combo(s), rerank=${process.env.RERANK_PROVIDER ?? "auto"}`,
  );

  // Embed each distinct question once and reuse it for every combination.
  const embeddings = new Map<string, number[]>();
  const questions = [...new Set(cases.map((testCase) => testCase.question))];
  console.log(`Embedding ${questions.length} distinct questions...`);
  await mapWithConcurrency(questions, concurrency, async (question) => {
    embeddings.set(question, await generateEmbedding(question));
  });

  for (const combo of combos) {
    const results = await mapWithConcurrency(cases, concurrency, async (testCase) => {
      const started = Date.now();
      const chunks = await getSpoilerFreeContext(
        testCase.question,
        evalSet.seriesId,
        testCase.progress,
        {
          candidates: combo.candidates,
          finalCount: combo.finalCount,
          rerankCandidates: combo.candidates,
          matchThreshold: combo.matchThreshold,
          rrfK: combo.rrfK,
          queryEmbedding: embeddings.get(testCase.question),
        },
      );
      return evaluateCase(testCase, chunks, Date.now() - started);
    });

    summarize(combo, results);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
