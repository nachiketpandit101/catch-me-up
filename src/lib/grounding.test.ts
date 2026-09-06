import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enforceGrounding,
  extractCitedIds,
  insufficientContextMessage,
  parseCitationIds,
} from "./grounding";
import type { RetrievedChunk } from "./types";

function chunk(
  id: number,
  book: number,
  chapter: number,
  extras?: Partial<RetrievedChunk>,
): RetrievedChunk {
  return {
    id,
    series_id: "red-rising",
    book_number: book,
    chapter_number: chapter,
    chunk_index: 0,
    content: "passage",
    ...extras,
  };
}

const corpus = [chunk(12, 1, 3), chunk(40, 2, 8)];

describe("parseCitationIds", () => {
  it("parses single and multi ids, with optional chunk: prefix", () => {
    assert.deepEqual(parseCitationIds("12"), [12]);
    assert.deepEqual(parseCitationIds("12, 40"), [12, 40]);
    assert.deepEqual(parseCitationIds("chunk:12, chunk:40"), [12, 40]);
    assert.deepEqual(parseCitationIds("-1"), [-1]);
    assert.equal(parseCitationIds("Book 1"), null);
  });
});

describe("extractCitedIds", () => {
  it("collects unique ids from inline citations", () => {
    assert.deepEqual(
      extractCitedIds("A fact [12]. Another [12, 40]. Also [chunk:40]."),
      [12, 40],
    );
  });
});

describe("enforceGrounding", () => {
  it("rewrites valid citations to chapter labels", () => {
    const result = enforceGrounding(
      "Darrow is a Red from Mars [12]. He later stands before the Golds [40].",
      corpus,
      2,
    );
    assert.equal(result.ok, true);
    assert.equal(result.grounded, true);
    assert.equal(result.refused, false);
    assert.match(result.text, /Book 1, Ch\. 3/);
    assert.match(result.text, /Book 2, Ch\. 8/);
    assert.deepEqual(result.citedIds.sort((a, b) => a - b), [12, 40]);
  });

  it("strips uncited claims and keeps grounded remainder", () => {
    const result = enforceGrounding(
      "Darrow is a Red from Mars [12]. He secretly becomes a god-emperor.",
      corpus,
      2,
    );
    assert.equal(result.ok, true);
    assert.equal(result.grounded, true);
    assert.match(result.text, /Darrow is a Red from Mars/);
    assert.doesNotMatch(result.text, /god-emperor/);
    assert.equal(result.droppedSentences, 1);
  });

  it("fails closed when nothing is grounded", () => {
    const result = enforceGrounding(
      "Sevro is definitely a Pixie and also the Sovereign.",
      corpus,
      2,
    );
    assert.equal(result.ok, false);
    assert.equal(result.refused, true);
    assert.equal(result.text, insufficientContextMessage(2));
    assert.deepEqual(result.citedIds, []);
  });

  it("reattaches citations that landed after the period", () => {
    const result = enforceGrounding(
      "Darrow is a Red from Mars. [12] He later stands before the Golds. [40]",
      corpus,
      2,
    );
    assert.equal(result.ok, true);
    assert.equal(result.droppedSentences, 0);
    assert.match(result.text, /Book 1, Ch\. 3/);
    assert.match(result.text, /Book 2, Ch\. 8/);
  });

  it("drops unknown ids and refuses if no valid citation remains", () => {
    const result = enforceGrounding("A made-up claim. [999]", corpus, 2);
    assert.equal(result.ok, false);
    assert.deepEqual(result.unknownIds, [999]);
    assert.equal(result.text, insufficientContextMessage(2));
  });

  it("accepts a clean refusal without citations", () => {
    const result = enforceGrounding(insufficientContextMessage(2), corpus, 2);
    assert.equal(result.ok, true);
    assert.equal(result.refused, true);
    assert.equal(result.grounded, false);
    assert.equal(result.text, insufficientContextMessage(2));
  });

  it("cites web fallback chunks by title", () => {
    const web = chunk(-1, 0, 0, {
      source: "web",
      title: "Red Rising wiki",
      url: "https://example.com",
    });
    const result = enforceGrounding(
      "Lykos is a mining colony [-1].",
      [web],
      1,
    );
    assert.equal(result.ok, true);
    assert.match(result.text, /Web: Red Rising wiki/);
    assert.deepEqual(result.citedIds, [-1]);
  });
});
