# Catch Me Up

Spoiler-free book series catch-up assistant. Ask questions about a series; answers are grounded only in chunks at or below your current book progress.

## Stack

- Next.js (App Router) + TypeScript
- Supabase Postgres + pgvector
- Google Gemini (`text-embedding-004`, `gemini-2.0-flash`)

## Setup

1. Create a [Supabase](https://supabase.com) project and enable the **pgvector** extension.
2. Run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) in the SQL Editor.
3. Create a [Google AI Studio](https://aistudio.google.com/apikey) API key.
4. Copy `.env.example` to `.env.local` and fill in values.
5. Place book markdown under `data/` (see [`data/README.md`](data/README.md)).
6. `npm install` → `npm run ingest` → `npm run dev`
