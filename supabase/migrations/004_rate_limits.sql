-- Per-user rate limiting for the chat endpoint.
-- Tracks request counts in sliding windows (per-minute, per-day).

create table if not exists rate_limits (
  user_id uuid not null,
  window_type text not null check (window_type in ('minute', 'day')),
  window_start timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (user_id, window_type, window_start)
);

-- Index for cleanup queries
create index if not exists rate_limits_expires_idx
  on rate_limits (expires_at);

-- Atomic check-and-increment: bumps the counter if a row exists for the
-- current window, otherwise inserts a new row with count = 1.
create or replace function increment_rate_limit(
  p_user_id uuid,
  p_window_type text,
  p_window_start timestamptz,
  p_expires_at timestamptz
)
returns integer
language sql
volatile
as $$
  insert into rate_limits (user_id, window_type, window_start, request_count, expires_at)
  values (p_user_id, p_window_type, p_window_start, 1, p_expires_at)
  on conflict (user_id, window_type, window_start)
  do update set request_count = rate_limits.request_count + 1
  returning request_count;
$$;

-- Purge expired windows (run periodically or via pg_cron)
create or replace function cleanup_rate_limits()
returns void
language sql
volatile
as $$
  delete from rate_limits where expires_at < now();
$$;
