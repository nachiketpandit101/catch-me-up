import { getChatModelId, generateSpoilerFreeReply } from "@/lib/chat";
import {
  CRAG_HEADER,
  SOURCES_HEADER,
  citationsForChunkIds,
  encodeCitations,
  encodeCragTrace,
} from "@/lib/citations";
import { retrieveWithCrag } from "@/lib/crag";
import { checkRateLimit, consumeRateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ChatRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

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

function formatApiError(error: unknown): { message: string; status: number } {
  const raw =
    error instanceof Error ? error.message : "Unexpected server error";

  if (
    raw.includes("RESOURCE_EXHAUSTED") ||
    raw.includes("exceeded your current quota") ||
    raw.includes("429")
  ) {
    return {
      status: 429,
      message: `Gemini API quota exceeded for model "${getChatModelId()}". Free-tier limit for this model may be 0. Set GEMINI_CHAT_MODEL in .env to a model with available quota (e.g. gemini-2.5-flash or gemini-3-flash-preview), wait for the retry window, or enable API billing in AI Studio. See https://ai.dev/rate-limit`,
    };
  }

  const status =
    raw.startsWith("prompt") ||
    raw.startsWith("seriesId") ||
    raw.startsWith("maxBookProgress") ||
    raw.startsWith("Request body")
      ? 400
      : 500;

  return { message: raw, status };
}

export async function POST(request: Request) {
  try {
    // --- Auth guard ---
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "Authentication required. Please sign in." },
        { status: 401 },
      );
    }

    // --- Rate limit guard ---
    const rateCheck = await checkRateLimit(user.id);
    if (!rateCheck.allowed) {
      return Response.json(
        {
          error: rateCheck.reason,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    // --- Consume one rate-limit slot ---
    await consumeRateLimit(user.id);

    const json = await request.json();
    const { prompt, seriesId, maxBookProgress } = validateBody(json);

    const { chunks, trace } = await retrieveWithCrag(
      prompt,
      seriesId,
      maxBookProgress,
    );

    const reply = await generateSpoilerFreeReply({
      prompt,
      maxBook: maxBookProgress,
      retrievedChunks: chunks,
    });

    const citations = citationsForChunkIds(chunks, reply.citedChunkIds);

    return new Response(reply.text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        [SOURCES_HEADER]: encodeCitations(citations),
        [CRAG_HEADER]: encodeCragTrace(trace),
      },
    });
  } catch (error) {
    const { message, status } = formatApiError(error);
    return Response.json({ error: message }, { status });
  }
}
