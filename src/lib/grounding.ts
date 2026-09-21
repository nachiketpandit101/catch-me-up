import { formatCitationLabel } from "@/lib/citations";
import { splitSentences } from "@/lib/ingest/text";
import type { RetrievedChunk } from "@/lib/types";

function citationGroupRegex(): RegExp {
  return /\[((?:chunk:)?-?\d+(?:\s*,\s*(?:chunk:)?-?\d+)*)\]/gi;
}

const CITATION_TOKEN =
  /\[(?:chunk:)?-?\d+(?:\s*,\s*(?:chunk:)?-?\d+)*\]/;

const LEADING_CITATIONS = new RegExp(
  `^(?:${CITATION_TOKEN.source}\\s*)+`,
  "i",
);

const CITATION_ONLY = new RegExp(
  `^(?:${CITATION_TOKEN.source}\\s*)+\\.?$`,
  "i",
);

/**
 * `splitSentences` cuts on the period, so `claim. [12] Next` becomes
 * `claim.` + `[12] Next`. Fold those leading citation tokens back onto
 * the previous sentence before grading grounding.
 */
export function attachOrphanCitations(sentences: string[]): string[] {
  const attached: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (CITATION_ONLY.test(trimmed) && attached.length > 0) {
      attached[attached.length - 1] =
        `${attached[attached.length - 1]} ${trimmed}`.trim();
      continue;
    }

    const leading = LEADING_CITATIONS.exec(trimmed);
    if (leading && attached.length > 0) {
      attached[attached.length - 1] =
        `${attached[attached.length - 1]} ${leading[0].trim()}`.trim();
      const rest = trimmed.slice(leading[0].length).trim();
      if (rest) attached.push(rest);
      continue;
    }

    attached.push(trimmed);
  }

  return attached;
}

export type RefusalKind = "unclear" | "not_found";

export function unclearQuestionMessage(): string {
  return "I'm not sure what you're asking. Try a question about a character, a place, or something that happened in the books.";
}

export function insufficientContextMessage(maxBook: number): string {
  return `I couldn't find that in the books you've read through Book ${maxBook}. If it hasn't come up yet, I won't spoil it.`;
}

export function canonicalRefusal(kind: RefusalKind, maxBook: number): string {
  return kind === "unclear"
    ? unclearQuestionMessage()
    : insufficientContextMessage(maxBook);
}

const VOWELS = new Set("aeiouy");

function isVowel(character: string): boolean {
  return VOWELS.has(character);
}

function consonantVowelAlternation(token: string): number {
  if (token.length < 2) return 1;
  let alternating = 0;
  for (let i = 1; i < token.length; i += 1) {
    if (isVowel(token[i - 1]) !== isVowel(token[i])) alternating += 1;
  }
  return alternating / (token.length - 1);
}

function looksLikeWord(token: string): boolean {
  if (token.length < 2 || token.length > 24) return false;
  if (token.length === 2) return [...token].some(isVowel);
  const vowels = [...token].filter(isVowel).length;
  const ratio = vowels / token.length;
  if (ratio < 0.18 || ratio > 0.8) return false;
  return consonantVowelAlternation(token) >= 0.45;
}

const QUESTION_CUES =
  /\b(who|what|where|when|why|how|which|whose|whom|is|are|was|were|did|does|do|can|could|would|should|will|has|have|had|tell|explain|remind|happen|happened|about|remember|mean|means|relationship|between)\b/i;

const COMMON_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "at",
  "by",
  "as",
  "if",
  "not",
  "this",
  "that",
  "my",
  "me",
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "it",
  "his",
  "her",
]);

/**
 * Cheap check for keyboard mash / empty noise so we don't pretend it is a
 * plot point that hasn't happened yet.
 */
export function isUnclearQuestion(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return true;

  const letters = text.replace(/[^a-zA-Z]+/g, "");
  if (letters.length < 2) return true;

  if (/[?]/.test(text) || QUESTION_CUES.test(text)) return false;

  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return true;
  if (tokens.some((token) => COMMON_WORDS.has(token))) return false;

  const contentTokens = tokens.filter((token) => token.length >= 2);
  if (contentTokens.length === 0) return true;
  return contentTokens.some((token) => !looksLikeWord(token));
}

export function classifyRefusal(
  text: string,
  maxBook: number,
): RefusalKind | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "not_found";
  if (normalized === unclearQuestionMessage().toLowerCase()) return "unclear";
  if (normalized === insufficientContextMessage(maxBook).toLowerCase()) {
    return "not_found";
  }

  const unclear =
    normalized.includes("not sure what you're asking") ||
    normalized.includes("not sure what you are asking") ||
    normalized.includes("couldn't tell what") ||
    normalized.includes("could not tell what") ||
    normalized.includes("doesn't look like a question") ||
    normalized.includes("does not look like a question");

  const notFound =
    normalized.includes("couldn't find that") ||
    normalized.includes("could not find that") ||
    normalized.includes("has not occurred yet") ||
    normalized.includes("is not mentioned") ||
    normalized.includes("haven't read that far") ||
    normalized.includes("have not read that far") ||
    normalized.includes("won't spoil") ||
    normalized.includes("will not spoil");

  if (unclear) return "unclear";
  if (notFound) return "not_found";
  return null;
}

export function isInsufficientContext(text: string, maxBook: number): boolean {
  return classifyRefusal(text, maxBook) !== null;
}

export function parseCitationIds(group: string): number[] | null {
  const ids: number[] = [];
  for (const part of group.split(/\s*,\s*/)) {
    const match = /^(?:chunk:)?(-?\d+)$/i.exec(part.trim());
    if (!match) return null;
    ids.push(Number(match[1]));
  }
  return ids.length > 0 ? ids : null;
}

export function extractCitedIds(text: string): number[] {
  const ids: number[] = [];
  for (const match of text.matchAll(citationGroupRegex())) {
    const parsed = parseCitationIds(match[1]);
    if (parsed) ids.push(...parsed);
  }
  return [...new Set(ids)];
}

function citationLabelFor(chunk: RetrievedChunk): string {
  if (chunk.source === "web") {
    return chunk.title?.trim() ? `Web: ${chunk.title.trim()}` : "Web source";
  }
  return formatCitationLabel(chunk.book_number, chunk.chapter_number);
}

function rewriteCitations(
  text: string,
  chunksById: Map<number, RetrievedChunk>,
): string {
  return text.replace(citationGroupRegex(), (full, group: string) => {
    const parsed = parseCitationIds(group);
    if (!parsed) return full;

    const labels = [
      ...new Set(
        parsed
          .map((id) => chunksById.get(id))
          .filter((chunk): chunk is RetrievedChunk => Boolean(chunk))
          .map(citationLabelFor),
      ),
    ];

    return labels.length > 0 ? `(${labels.join("; ")})` : "";
  });
}

export type GroundingResult = {
  /** Safe to return to the user as-is (cited answer or a clean refusal). */
  ok: boolean;
  /** True when the answer contains at least one cited claim. */
  grounded: boolean;
  /** True when we are returning a canned refusal. */
  refused: boolean;
  text: string;
  citedIds: number[];
  unknownIds: number[];
  droppedSentences: number;
};

/**
 * Require every non-refusal sentence to cite at least one retrieved chunk ID.
 * Unknown IDs are dropped; sentences that then have no valid citation are
 * stripped. If nothing grounded remains, fail closed with the refusal line.
 */
export function enforceGrounding(
  raw: string,
  chunks: RetrievedChunk[],
  maxBook: number,
): GroundingResult {
  const allowed = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      ok: true,
      grounded: false,
      refused: true,
      text: insufficientContextMessage(maxBook),
      citedIds: [],
      unknownIds: [],
      droppedSentences: 0,
    };
  }

  const refusal = classifyRefusal(trimmed, maxBook);
  if (refusal) {
    return {
      ok: true,
      grounded: false,
      refused: true,
      text: canonicalRefusal(refusal, maxBook),
      citedIds: [],
      unknownIds: [],
      droppedSentences: 0,
    };
  }

  const unknownIds = [
    ...new Set(extractCitedIds(trimmed).filter((id) => !allowed.has(id))),
  ];

  const kept: string[] = [];
  let droppedSentences = 0;
  const citedIds = new Set<number>();

  for (const sentence of attachOrphanCitations(splitSentences(trimmed))) {
    const groups = [...sentence.matchAll(citationGroupRegex())];
    const validIds: number[] = [];
    let hasCitationShape = false;

    for (const match of groups) {
      const parsed = parseCitationIds(match[1]);
      if (!parsed) continue;
      hasCitationShape = true;
      for (const id of parsed) {
        if (allowed.has(id)) validIds.push(id);
      }
    }

    if (validIds.length === 0) {
      if (isInsufficientContext(sentence, maxBook)) {
        continue;
      }
      droppedSentences += 1;
      continue;
    }

    let cleaned = sentence;
    if (hasCitationShape) {
      cleaned = sentence.replace(citationGroupRegex(), (full, group: string) => {
        const parsed = parseCitationIds(group);
        if (!parsed) return full;
        const ids = parsed.filter((id) => allowed.has(id));
        if (ids.length === 0) return "";
        return `[${ids.join(", ")}]`;
      });
    }

    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    if (!cleaned) {
      droppedSentences += 1;
      continue;
    }

    for (const id of validIds) citedIds.add(id);
    kept.push(cleaned);
  }

  if (kept.length === 0) {
    return {
      ok: false,
      grounded: false,
      refused: true,
      text: insufficientContextMessage(maxBook),
      citedIds: [],
      unknownIds,
      droppedSentences,
    };
  }

  const rewritten = rewriteCitations(kept.join(" "), allowed).replace(
    /\s{2,}/g,
    " ",
  );

  return {
    ok: true,
    grounded: true,
    refused: false,
    text: rewritten.trim(),
    citedIds: [...citedIds],
    unknownIds,
    droppedSentences,
  };
}
