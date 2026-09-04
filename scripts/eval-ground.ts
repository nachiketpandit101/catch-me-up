/**
 * Resolve `expect.chapters` in the eval set from the local book text.
 *
 * Expected chapter numbers are derived, never hand-written: a chapter counts as
 * ground truth when its text contains every keyword for that case. The script
 * also validates refusal cases, which are only meaningful if the answer really
 * is absent from everything at or below the reader's progress.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseChapters } from "../src/lib/ingest/parse";

type ManifestBook = { bookNumber: number; title: string; path: string };
type Manifest = { series: { id: string; title: string; books: ManifestBook[] }[] };

type EvalCase = {
  id: string;
  question: string;
  progress: number;
  expect?: { book: number; keywords: string[]; chapters: number[] };
  refusal?: { answerBook: number; keywords: string[] };
};

type EvalSet = { seriesId: string; note?: string; cases: EvalCase[] };

type BookIndex = Map<number, { chapterNumber: number; haystack: string }[]>;

function matchesAll(haystack: string, keywords: string[]): boolean {
  return keywords.every((keyword) => haystack.includes(keyword.toLowerCase()));
}

async function buildIndex(manifest: Manifest, seriesId: string): Promise<BookIndex> {
  const series = manifest.series.find((s) => s.id === seriesId);
  if (!series) throw new Error(`Series "${seriesId}" not in manifest`);

  const index: BookIndex = new Map();

  for (const book of series.books) {
    const raw = await readFile(path.join(process.cwd(), book.path), "utf8");
    const chapters = parseChapters(raw).map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      haystack: chapter.content.toLowerCase(),
    }));
    index.set(book.bookNumber, chapters);
    console.log(`Indexed book ${book.bookNumber} (${chapters.length} chapters)`);
  }

  return index;
}

function chaptersContaining(
  index: BookIndex,
  bookNumber: number,
  keywords: string[],
): number[] {
  const chapters = index.get(bookNumber) ?? [];
  return chapters
    .filter((chapter) => matchesAll(chapter.haystack, keywords))
    .map((chapter) => chapter.chapterNumber)
    .sort((a, b) => a - b);
}

async function main() {
  const evalPath = path.join(process.cwd(), "eval", "red-rising.json");
  const manifest = JSON.parse(
    await readFile(path.join(process.cwd(), "data", "manifest.json"), "utf8"),
  ) as Manifest;
  const evalSet = JSON.parse(await readFile(evalPath, "utf8")) as EvalSet;

  const index = await buildIndex(manifest, evalSet.seriesId);
  const problems: string[] = [];

  for (const testCase of evalSet.cases) {
    if (testCase.expect) {
      const { book, keywords } = testCase.expect;
      const chapters = chaptersContaining(index, book, keywords);
      testCase.expect.chapters = chapters;

      const total = index.get(book)?.length ?? 0;
      const share = total > 0 ? chapters.length / total : 0;

      if (chapters.length === 0) {
        problems.push(`${testCase.id}: no chapter in book ${book} matches ${JSON.stringify(keywords)}`);
      } else if (share > 0.35) {
        problems.push(
          `${testCase.id}: keywords match ${chapters.length}/${total} chapters (${Math.round(share * 100)}%) - too broad to be a useful target`,
        );
      } else {
        console.log(
          `  ${testCase.id}: book ${book} -> ${chapters.length} chapter(s) ${JSON.stringify(chapters.slice(0, 8))}${chapters.length > 8 ? "..." : ""}`,
        );
      }
      continue;
    }

    if (testCase.refusal) {
      const { answerBook, keywords } = testCase.refusal;

      // The point of a refusal case: nothing at or below progress should be
      // able to answer it.
      const leaks: number[] = [];
      for (let book = 1; book <= testCase.progress; book++) {
        if (chaptersContaining(index, book, keywords).length > 0) leaks.push(book);
      }

      const support = chaptersContaining(index, answerBook, keywords);

      if (leaks.length > 0) {
        problems.push(
          `${testCase.id}: NOT a valid refusal - ${JSON.stringify(keywords)} already appears in book(s) ${leaks.join(", ")} at progress ${testCase.progress}`,
        );
      } else if (support.length === 0) {
        problems.push(
          `${testCase.id}: answer not found in book ${answerBook} for ${JSON.stringify(keywords)}`,
        );
      } else {
        console.log(
          `  ${testCase.id}: clean refusal (answer lives in book ${answerBook}, ${support.length} chapter(s))`,
        );
      }
    }
  }

  await writeFile(evalPath, `${JSON.stringify(evalSet, null, 2)}\n`, "utf8");

  console.log(`\nWrote ${evalPath}`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log("All cases grounded cleanly.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
