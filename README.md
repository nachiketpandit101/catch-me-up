# Catch Me Up

Spoiler-free book series catch-up assistant. Ask questions about a series; answers are grounded only in chunks at or below your current book progress.

## Stack

- Next.js (App Router) + TypeScript
- Supabase Postgres + pgvector
- Google Gemini (`gemini-embedding-001`, `gemini-2.5-flash`)

## Setup

1. Create a [Supabase](https://supabase.com) project and enable the **pgvector** extension.
2. Run the files in [`supabase/migrations/`](supabase/migrations) in order (`001_init.sql`, `002_add_books_3_6.sql`, `003_hybrid_search.sql`) in the SQL Editor.
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

## Retrieval

Every question runs two retrievers over the same spoiler-bounded scope, both filtering `book_number <= your progress` in SQL:

- **Dense** — `match_book_chunks` cosine search over pgvector embeddings, for paraphrased questions.
- **Sparse** — `bm25_book_chunks`, an Okapi BM25 implementation over Postgres `tsvector`, for exact names and rare terms that embeddings blur together.

Their ranked lists are merged with Reciprocal Rank Fusion, `score(d) = Σ weight / (k + rank(d))`, which fuses on rank so incomparable cosine and BM25 scales need no normalization.

The fused pool is then reranked. Both retrievers score the query and a chunk independently, so a chunk can rank highly while answering a different question; a cross-encoder reads the pair together and is much more accurate, but only affordably over a shortlist. `RERANK_CANDIDATES` fused chunks go to the reranker, which trims them to `RETRIEVAL_FINAL_CHUNKS` for the answer context.

Set `RERANK_PROVIDER`, or let it auto-detect from whichever credential is present:

| Provider | Configure with | Notes |
|---|---|---|
| `cohere` | `COHERE_API_KEY` | Cohere Rerank, default `rerank-v3.5` |
| `jina` | `JINA_API_KEY` | Jina Reranker |
| `tei` | `RERANK_ENDPOINT` | Self-hosted BGE-Reranker behind HuggingFace Text Embeddings Inference |
| `gemini` | `RERANK_PROVIDER=gemini` | Listwise LLM fallback; opt-in only since it spends chat quota per query |
| `none` | — | Default when nothing is configured; fusion order is used as-is |

Reranking is best-effort: a provider error or a timeout past `RERANK_TIMEOUT_MS` falls back to fusion order instead of failing the request. Set `RETRIEVAL_DEBUG=true` to log per-chunk ranks and scores for each query.

If migration `003` has not been applied, sparse retrieval is skipped and the app falls back to dense-only.

### Corrective RAG

After reranking, a grader node scores each passage for query relevance (`CRAG_RELEVANCE_THRESHOLD`, default 0.5). Mean confidence of the relevant set is compared to `CRAG_CONFIDENCE_THRESHOLD` (default 0.55):

1. **Use** — keep only relevant chunks and generate.
2. **Expand** — rewrite the question into 1–3 retrieval queries, re-retrieve, merge, and grade again.
3. **Web search** — last resort when expansion still finds **no** relevant book passages. Tavily is used when `TAVILY_API_KEY` is set; otherwise Gemini Google Search. Results that name a later book title are dropped before they can enter context, and the grader also rejects later-plot passages. Book chunks always outrank web snippets in the prompt.
4. **Refuse** — if confidence is still low, the model is not given those passages.

Disable the graph with `CRAG_ENABLED=false`. Disable only the web fallback with `CRAG_WEB_SEARCH=false`. The retrieval eval (`npm run eval`) still calls the hybrid retriever directly, so it does not spend grader quota.

### Citation grounding

Every answer is generated with chunk IDs in context and must cite them inline (`[12]` or `[12, 40]`). A guardrail then parses the draft: unknown IDs are dropped, uncited claims are stripped, and if nothing grounded remains the API returns the insufficient-context refusal instead of an unmoored answer. Surviving citations are rewritten to chapter labels in the visible text. `x-sources` lists only chunks the answer actually cited.

Answers cite their sources. The API returns one citation per chapter in the `x-sources` response header (base64 JSON), so the answer body stays a plain text stream and sources render before the first token arrives. Chapters found only by BM25 carry no `bestSimilarity`, which makes it easy to see when keyword search is doing the work.

## Evaluation

[`eval/red-rising.json`](eval/red-rising.json) holds 81 grounded cases: 66 answerable questions across the six books, plus 15 "should refuse" questions whose answers live in a book past the reader's progress.

Expected chapters are never hand-written. Each case declares keywords, and `npm run eval:ground` resolves the chapters that actually contain them from the local book text, rejecting keywords too broad to be a useful target. It also validates every refusal case by confirming the keywords appear in **no** book at or below that case's progress — which is how the first draft was caught claiming Ragnar was unknown at book 2 when he is named there.

```bash
npm run eval:ground                                   # refresh expected chapters
npm run eval                                          # retrieval only, no LLM
npm run eval -- --no-rerank --threshold 0.3,0.7       # sweep a parameter
npm run eval -- --case b1- --concurrency 8            # filter to a subset
```

The runner never calls the chat model, so a full pass costs one query embedding per question (cached across sweep combinations) and takes about 12 seconds. It reports recall@1/@5/@k, MRR, mean top cosine for answerable versus refusal cases, and asserts that no chunk past the reader's progress was ever retrieved.

Baseline at the shipped defaults: **recall@12 = 100%**, MRR 0.774, zero spoiler violations, zero refusal leaks, ~200ms mean retrieval latency.

Two findings worth knowing before tuning:

- `DENSE_MATCH_THRESHOLD` does nothing between 0.3 and 0.6, because it only prunes a dense tail that RRF already ranks below the sparse hits. It first bites at **0.70**, where refusal cases lose every dense match while answerable recall@12 stays at 100%. By 0.75 recall starts breaking.
- The mean cosine gap between answerable and refusal questions is only ~0.07 at the default threshold, so a similarity cutoff cannot by itself decide when to refuse. Spoiler safety comes from the SQL `book_number` filter, not from scores.

For rate limits, pace embedding with env vars:

```bash
EMBED_DELAY_MS=2000 EMBED_UPSERT_BATCH=10 npm run ingest -- red-rising --books 3,4,5,6
```

Open [http://localhost:3000](http://localhost:3000), set **Reading: Book N**, and ask questions.
