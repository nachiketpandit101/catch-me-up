import { streamSpoilerFreeReply } from "@/lib/chat";
import { getSpoilerFreeContext } from "@/lib/retrieval";
import type { ChatRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function validateBody(body: unknown): ChatRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }

  const { prompt, seriesId, maxBookProgress } = body as Record<
    string,
    unknown
  >;

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("prompt must be a non-empty string");
  }
  if (typeof seriesId !== "string" || seriesId.trim().length === 0) {
    throw new Error("seriesId must be a non-empty string");
  }
  if (
    typeof maxBookProgress !== "number" ||
    !Number.isInteger(maxBookProgress) ||
    maxBookProgress < 1
  ) {
    throw new Error("maxBookProgress must be an integer >= 1");
  }

  return {
    prompt: prompt.trim(),
    seriesId: seriesId.trim(),
    maxBookProgress,
  };
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { prompt, seriesId, maxBookProgress } = validateBody(json);

    const retrievedChunks = await getSpoilerFreeContext(
      prompt,
      seriesId,
      maxBookProgress,
    );

    const result = await streamSpoilerFreeReply({
      prompt,
      maxBook: maxBookProgress,
      retrievedChunks,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    const status = message.startsWith("prompt") ||
      message.startsWith("seriesId") ||
      message.startsWith("maxBookProgress") ||
      message.startsWith("Request body")
      ? 400
      : 500;

    return Response.json({ error: message }, { status });
  }
}
