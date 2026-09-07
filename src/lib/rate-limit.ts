import { createServiceSupabaseClient } from "@/lib/supabase/server";

const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 3);
const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY ?? 15);

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
};

function minuteWindowStart(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function dayWindowStart(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Check whether a user is within their rate limits WITHOUT consuming a slot.
 */
export async function checkRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  const supabase = createServiceSupabaseClient();

  const minuteStart = minuteWindowStart();
  const dayStart = dayWindowStart();

  const { data: rows } = await supabase
    .from("rate_limits")
    .select("window_type, request_count")
    .eq("user_id", userId)
    .in("window_type", ["minute", "day"])
    .or(
      `and(window_type.eq.minute,window_start.eq.${minuteStart.toISOString()}),and(window_type.eq.day,window_start.eq.${dayStart.toISOString()})`,
    );

  const minuteCount =
    rows?.find((r) => r.window_type === "minute")?.request_count ?? 0;
  const dayCount =
    rows?.find((r) => r.window_type === "day")?.request_count ?? 0;

  if (dayCount >= PER_DAY) {
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const retryAfterSeconds = Math.ceil(
      (nextDay.getTime() - Date.now()) / 1000,
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Daily limit reached (${PER_DAY} requests/day). Resets at midnight.`,
    };
  }

  if (minuteCount >= PER_MINUTE) {
    const nextMinute = new Date(minuteStart);
    nextMinute.setMinutes(nextMinute.getMinutes() + 1);
    const retryAfterSeconds = Math.ceil(
      (nextMinute.getTime() - Date.now()) / 1000,
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Rate limit reached (${PER_MINUTE} requests/minute). Try again in ${retryAfterSeconds}s.`,
    };
  }

  return { allowed: true };
}

/**
 * Atomically consume one rate-limit slot for a user across both windows.
 */
export async function consumeRateLimit(userId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const minuteStart = minuteWindowStart();
  const dayStart = dayWindowStart();

  const minuteExpires = new Date(minuteStart);
  minuteExpires.setMinutes(minuteExpires.getMinutes() + 2); // keep for 2 min

  const dayExpires = new Date(dayStart);
  dayExpires.setDate(dayExpires.getDate() + 1);
  dayExpires.setHours(dayExpires.getHours() + 1); // keep for 1h past midnight

  // Use the atomic upsert function for both windows
  await Promise.all([
    supabase.rpc("increment_rate_limit", {
      p_user_id: userId,
      p_window_type: "minute",
      p_window_start: minuteStart.toISOString(),
      p_expires_at: minuteExpires.toISOString(),
    }),
    supabase.rpc("increment_rate_limit", {
      p_user_id: userId,
      p_window_type: "day",
      p_window_start: dayStart.toISOString(),
      p_expires_at: dayExpires.toISOString(),
    }),
  ]);
}
