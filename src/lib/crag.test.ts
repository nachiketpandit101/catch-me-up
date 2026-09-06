import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideCorrectiveAction,
  mergeChunks,
  retrievalConfidence,
  selectRelevantChunks,
  type ChunkGrade,
} from "./crag";
import type { RetrievedChunk } from "./types";

function chunk(id: number, extras?: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    id,
    series_id: "red-rising",
    book_number: 1,
    chapter_number: 1,
    chunk_index: 0,
    content: "passage",
    ...extras,
  };
}

describe("retrievalConfidence", () => {
  it("is 0 when nothing relevant is graded", () => {
    const grades: ChunkGrade[] = [
      { id: 1, relevant: false, score: 0.9 },
      { id: 2, relevant: true, score: 0.2 },
    ];
    assert.equal(retrievalConfidence(grades), 0);
    assert.equal(retrievalConfidence([]), 0);
  });

  it("averages relevant scores at or above the threshold", () => {
    const grades: ChunkGrade[] = [
      { id: 1, relevant: true, score: 0.8 },
      { id: 2, relevant: true, score: 0.6 },
      { id: 3, relevant: false, score: 0.9 },
    ];
    assert.equal(retrievalConfidence(grades), 0.7);
  });
});

describe("decideCorrectiveAction", () => {
  it("uses context when confidence clears the threshold", () => {
    assert.equal(decideCorrectiveAction(0.8, false, false, true, 3), "use");
  });

  it("expands first, then web, then uses web hits, then refuses", () => {
    assert.equal(decideCorrectiveAction(0.2, false, false, true, 0, 0), "expand");
    assert.equal(decideCorrectiveAction(0.2, true, false, true, 0, 0), "web");
    assert.equal(decideCorrectiveAction(0.74, true, true, true, 0, 4), "use");
    assert.equal(decideCorrectiveAction(0.2, true, true, true, 0, 0), "refuse");
    assert.equal(decideCorrectiveAction(0.2, true, false, false, 0, 0), "refuse");
  });

  it("keeps book hits instead of falling back to the web", () => {
    assert.equal(decideCorrectiveAction(0.2, true, false, true, 2), "use");
  });
});

describe("mergeChunks", () => {
  it("dedupes by id and keeps the higher scored copy", () => {
    const merged = mergeChunks(
      [chunk(1, { fusedScore: 0.1 }), chunk(2, { fusedScore: 0.4 })],
      [chunk(1, { fusedScore: 0.9, content: "better" }), chunk(3)],
    );
    const byId = new Map(merged.map((item) => [item.id, item]));
    assert.equal(byId.get(1)?.content, "better");
    assert.equal(merged.length, 3);
  });
});

describe("selectRelevantChunks", () => {
  it("keeps only grader-approved passages, books before web", () => {
    const selected = selectRelevantChunks(
      [
        chunk(1),
        chunk(2, { source: "web", title: "wiki" }),
        chunk(3),
        chunk(4, { source: "web", title: "blog" }),
      ],
      [
        { id: 1, relevant: true, score: 0.7 },
        { id: 2, relevant: true, score: 0.95 },
        { id: 3, relevant: true, score: 0.2 },
        { id: 4, relevant: true, score: 0.8 },
      ],
    );
    assert.deepEqual(
      selected.map((item) => item.id),
      [1, 2, 4],
    );
  });
});
