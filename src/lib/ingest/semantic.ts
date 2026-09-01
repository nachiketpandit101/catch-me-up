import { packBlocks, recursiveSplit, splitSentences, tailOverlap } from "./text";

export type Embedder = (texts: string[]) => Promise<number[][]>;

export type SemanticChunkOptions = {
  embed: Embedder;
  targetChars: number;
  minChars: number;
  maxChars: number;
  overlapChars: number;
  /** Neighbouring sentences folded into each embedding window. */
  bufferSize: number;
  /** Distance percentile above which a sentence gap becomes a breakpoint. */
  percentile: number;
};

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denominator) return 1;
  return 1 - dot / denominator;
}

function percentileOf(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

function buildWindows(sentences: string[], bufferSize: number): string[] {
  return sentences.map((_, index) => {
    const start = Math.max(0, index - bufferSize);
    const end = Math.min(sentences.length, index + bufferSize + 1);
    return sentences.slice(start, end).join(" ");
  });
}

/**
 * Split text where consecutive sentence windows drift apart in embedding space,
 * so a chunk boundary lands on a topic shift instead of a character count.
 */
export async function semanticChunk(
  text: string,
  options: SemanticChunkOptions,
): Promise<string[]> {
  const { targetChars, minChars, maxChars, overlapChars } = options;
  const packOptions = { targetChars, minChars, maxChars, overlapChars };

  const sentences = splitSentences(text);
  if (sentences.length < 4) {
    return packBlocks(recursiveSplit(text, maxChars), packOptions);
  }

  const embeddings = await options.embed(
    buildWindows(sentences, options.bufferSize),
  );
  if (embeddings.length !== sentences.length) {
    throw new Error(
      `Semantic chunking expected ${sentences.length} embeddings, got ${embeddings.length}`,
    );
  }

  const distances: number[] = [];
  for (let i = 0; i < embeddings.length - 1; i++) {
    distances.push(cosineDistance(embeddings[i], embeddings[i + 1]));
  }

  const threshold = percentileOf(distances, options.percentile);
  const groups: string[] = [];
  let current: string[] = [];

  sentences.forEach((sentence, index) => {
    current.push(sentence);
    const isBreakpoint =
      index < distances.length && distances[index] > threshold;
    if (isBreakpoint) {
      groups.push(current.join(" "));
      current = [];
    }
  });
  if (current.length > 0) groups.push(current.join(" "));

  // Semantic boundaries alone can produce runt or oversized groups; reconcile
  // them against the size envelope while keeping the detected split points.
  const merged: string[] = [];
  let buffer = "";

  for (const group of groups) {
    if (!buffer) {
      buffer = group;
      continue;
    }
    if (buffer.length < minChars && buffer.length + group.length + 2 <= maxChars) {
      buffer = `${buffer}\n\n${group}`;
      continue;
    }
    merged.push(buffer);
    buffer = group;
  }
  if (buffer) merged.push(buffer);

  const sized = merged.flatMap((group) =>
    group.length <= maxChars
      ? [group]
      : packBlocks(recursiveSplit(group, maxChars), packOptions),
  );

  return sized
    .map((chunk, index) => {
      if (index === 0) return chunk;
      const carry = tailOverlap(sized[index - 1], overlapChars);
      return carry ? `${carry}\n\n${chunk}` : chunk;
    })
    .filter((chunk) => chunk.trim().length > 40);
}
