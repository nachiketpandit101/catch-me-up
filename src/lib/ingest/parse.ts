export type Chapter = {
  chapterNumber: number;
  title: string;
  content: string;
};

function stripFrontMatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  return text.slice(end + 4);
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/::: ?\w*/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/-{3,}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseHashChapters(raw: string): Chapter[] {
  const text = stripFrontMatter(raw);
  const lines = text.split("\n");
  const chapters: Chapter[] = [];
  let current: Chapter | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!current) return;
    const content = cleanMarkdown(buffer.join("\n"));
    if (content.length > 80) {
      chapters.push({ ...current, content });
    }
  };

  for (const line of lines) {
    const chapterMatch = line.match(/^###\s+(\d+)\s+(.+)$/);
    const prologueMatch = line.match(/^##\s+Prologue\s*$/i);

    if (chapterMatch || prologueMatch) {
      flush();
      current = prologueMatch
        ? { chapterNumber: 0, title: "Prologue" }
        : {
            chapterNumber: Number(chapterMatch![1]),
            title: chapterMatch![2].trim(),
          };
      buffer = [];
      continue;
    }

    if (/^##\s+(Part|Acknowledgments)\b/i.test(line)) {
      continue;
    }

    if (current) buffer.push(line);
  }

  flush();
  return chapters;
}

function parseBoldNumberChapters(raw: string): Chapter[] {
  const text = stripFrontMatter(raw);
  const lines = text.split("\n");
  const chapters: Chapter[] = [];
  let current: Chapter | null = null;
  let buffer: string[] = [];
  let prologueBuffer: string[] = [];
  let reachedChapters = false;
  let storyStarted = false;

  const flush = () => {
    if (!current) return;
    const content = cleanMarkdown(buffer.join("\n"));
    if (content.length > 80) {
      chapters.push({ ...current, content });
    }
  };

  for (const line of lines) {
    const numMatch = line.match(/^\*\*(\d+)\*\*\s*$/);
    if (numMatch) {
      if (!reachedChapters && prologueBuffer.length > 0) {
        const prologue = cleanMarkdown(prologueBuffer.join("\n"));
        if (prologue.length > 80) {
          chapters.push({
            chapterNumber: 0,
            title: "Prologue",
            content: prologue,
          });
        }
      }
      flush();
      reachedChapters = true;
      current = {
        chapterNumber: Number(numMatch[1]),
        title: `Chapter ${numMatch[1]}`,
      };
      buffer = [];
      continue;
    }

    if (
      !reachedChapters &&
      (/^\*\*\s*\*\*\s*$/.test(line) ||
        (/^[A-Z]/.test(line.trim()) &&
          line.trim().length > 40 &&
          !line.includes("Dramatis")))
    ) {
      storyStarted = true;
    }

    if (!reachedChapters) {
      if (storyStarted) prologueBuffer.push(line);
      continue;
    }

    if (current && buffer.length < 8) {
      const titleMatch = line.match(/^\*\*([A-Za-z][^*]+)\*\*\s*$/);
      if (
        titleMatch &&
        !titleMatch[1].includes("![") &&
        titleMatch[1].trim().length < 80
      ) {
        current.title = titleMatch[1].trim();
        continue;
      }
    }

    if (current) buffer.push(line);
  }

  flush();
  return chapters;
}

/** Detect chapter style and return numbered chapters with cleaned text. */
export function parseChapters(raw: string): Chapter[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const hashChapters = parseHashChapters(normalized);
  if (hashChapters.length >= 5) return hashChapters;

  const boldChapters = parseBoldNumberChapters(normalized);
  if (boldChapters.length >= 5) return boldChapters;

  // Fallback: treat whole file as one chapter
  const content = cleanMarkdown(stripFrontMatter(normalized));
  if (!content) return [];
  return [{ chapterNumber: 1, title: "Full text", content }];
}
