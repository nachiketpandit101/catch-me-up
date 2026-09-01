/** Shared text primitives for structure-aware chunking. */

export type PackOptions = {
  targetChars: number;
  minChars: number;
  maxChars: number;
  overlapChars: number;
};

/** Trailing characters that still belong to the sentence that just ended. */
const SENTENCE_TRAILERS = new Set([
  '"',
  "'",
  "\u201d",
  "\u2019",
  "\u00bb",
  ")",
  "]",
  "\u2014",
]);

const TERMINATORS = new Set([".", "!", "?", "\u2026"]);

/** Titles and short forms whose trailing period does not end a sentence. */
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "st",
  "jr",
  "sr",
  "vs",
  "etc",
  "inc",
  "ltd",
  "no",
  "vol",
  "fig",
  "approx",
]);

function endsWithAbbreviation(text: string, periodIndex: number): boolean {
  let start = periodIndex;
  while (start > 0 && /[A-Za-z]/.test(text[start - 1])) start--;
  const word = text.slice(start, periodIndex);
  if (!word) return false;
  if (word.length === 1 && /[A-Z]/.test(word)) return true;
  return ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * Split prose into sentences. Line breaks are treated as hard boundaries so
 * paragraph structure survives, and abbreviations/initials are not split on.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let start = 0;
    for (let i = 0; i < trimmed.length; i++) {
      if (!TERMINATORS.has(trimmed[i])) continue;
      if (trimmed[i] === "." && endsWithAbbreviation(trimmed, i)) continue;

      let end = i + 1;
      while (end < trimmed.length && TERMINATORS.has(trimmed[end])) end++;
      while (end < trimmed.length && SENTENCE_TRAILERS.has(trimmed[end])) end++;
      if (end >= trimmed.length) break;
      if (!/\s/.test(trimmed[end])) continue;

      let next = end;
      while (next < trimmed.length && /\s/.test(trimmed[next])) next++;

      const piece = trimmed.slice(start, end).trim();
      if (piece) sentences.push(piece);
      start = next;
      i = next - 1;
    }

    const tail = trimmed.slice(start).trim();
    if (tail) sentences.push(tail);
  }

  return sentences;
}

function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + maxChars * 0.5) end = boundary;
    }
    const piece = text.slice(start, end).trim();
    if (piece) pieces.push(piece);
    start = end;
  }

  return pieces;
}

/**
 * Split text along the strongest structural boundary that still yields pieces
 * within `maxChars`: scene break, then paragraph, then line, then sentence.
 */
export function recursiveSplit(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const separators = [/\n\s*(?:\*\s*\*\s*\*|[*#\u2022]|-{3,})\s*\n/, /\n{2,}/, /\n/];

  for (const separator of separators) {
    const parts = trimmed
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return parts.flatMap((part) => recursiveSplit(part, maxChars));
    }
  }

  const sentences = splitSentences(trimmed);
  if (sentences.length > 1) {
    return sentences.flatMap((sentence) => recursiveSplit(sentence, maxChars));
  }

  return hardSplit(trimmed, maxChars);
}

/** Take whole sentences from the end of a chunk to seed the next one. */
export function tailOverlap(text: string, overlapChars: number): string {
  if (overlapChars <= 0) return "";

  const sentences = splitSentences(text);
  const carried: string[] = [];
  let length = 0;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i];
    if (length + sentence.length > overlapChars && carried.length > 0) break;
    carried.unshift(sentence);
    length += sentence.length + 1;
    if (length >= overlapChars) break;
  }

  return carried.join(" ");
}

/**
 * Greedily merge structural blocks up to `targetChars`, carrying sentence-level
 * overlap between neighbours so a split never strands context mid-thought.
 */
export function packBlocks(blocks: string[], options: PackOptions): string[] {
  const { targetChars, minChars, maxChars, overlapChars } = options;
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  const joined = () => current.join("\n\n");

  for (const block of blocks) {
    const wouldExceed = currentLength + block.length + 2 > targetChars;

    if (currentLength >= minChars && wouldExceed) {
      const text = joined();
      chunks.push(text);
      const carry = tailOverlap(text, overlapChars);
      current = carry ? [carry] : [];
      currentLength = carry ? carry.length + 2 : 0;
    }

    current.push(block);
    currentLength += block.length + 2;
  }

  if (currentLength > 0) {
    const text = joined();
    const previous = chunks[chunks.length - 1];
    if (
      previous &&
      text.length < minChars &&
      previous.length + text.length <= maxChars
    ) {
      chunks[chunks.length - 1] = `${previous}\n\n${text}`;
    } else {
      chunks.push(text);
    }
  }

  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 40);
}
