# Catch Me Up

Spoiler-free book series catch-up assistant. Ask questions about a series; answers are grounded only in chunks at or below your current book progress.

## Stack

- Next.js (App Router) + TypeScript
- Supabase Postgres + pgvector
- Google Gemini (`gemini-embedding-001`, `gemini-2.5-flash`)

## Setup

1. Create a [Supabase](https://supabase.com) project and enable the **pgvector** extension.
2. Run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) and [`supabase/migrations/002_add_books_3_6.sql`](supabase/migrations/002_add_books_3_6.sql) in the SQL Editor.
3. Create a [Google AI Studio](https://aistudio.google.com/apikey) API key.
4. Copy `.env.example` to `.env.local` (or use `.env`) and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `GEMINI_CHAT_MODEL` (default `gemini-2.5-flash`; avoid `gemini-2.0-flash` if free-tier limit is 0)
5. Place book markdown under `data/` (see [`data/README.md`](data/README.md)).
6. Install and ingest, then run the app:

```bash
npm install
npm run ingest                              # all books in manifest
npm run ingest:books                        # books 3–6 only
npx tsx scripts/ingest.ts red-rising 3 4 5 6   # same, explicit
npx tsx scripts/ingest.ts red-rising 3 --fresh # redo one book from scratch
npm run dev
```

Ingestion is resumable: if it stops on a 429 quota error, re-run the same command and it continues from the last saved chunk. Checkpoints live in `data/.ingest-cache/` (gitignored).

## Chunking

Chapters are split structurally rather than at fixed offsets. `recursiveSplit` walks a boundary hierarchy — scene break, paragraph, line, sentence — and only falls back to a hard cut when a single sentence exceeds the size cap. Blocks are then packed toward `CHUNK_TARGET_CHARS` with whole-sentence overlap carried between neighbours.

Set `CHUNK_STRATEGY=semantic` to place boundaries where meaning shifts instead: each sentence is embedded with its neighbours, cosine distance between consecutive windows is measured, and gaps above `SEMANTIC_PERCENTILE` become breakpoints. This costs one embedding per sentence, so it is off by default. Semantic chunk plans are cached in `data/.ingest-cache/*.chunks.json` and reused across resumed runs.

Changing any chunking setting requires re-ingesting with `--fresh`.

For rate limits, pace embedding with env vars:

```bash
EMBED_DELAY_MS=2000 EMBED_UPSERT_BATCH=10 npm run ingest -- red-rising --books 3,4,5,6
```

Open [http://localhost:3000](http://localhost:3000), set **Reading: Book N**, and ask questions.
