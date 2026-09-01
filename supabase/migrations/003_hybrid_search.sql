-- Sparse BM25 retrieval to run alongside the existing dense vector search.

alter table book_chunks
  add column if not exists tsv tsvector
  generated always as (to_tsvector('english', content)) stored;

-- BM25 length normalization needs total tokens, not the distinct lexeme count.
alter table book_chunks
  add column if not exists token_count integer
  generated always as (
    coalesce(array_length(regexp_split_to_array(btrim(content), '\s+'), 1), 0)
  ) stored;

create index if not exists book_chunks_tsv_idx
  on book_chunks
  using gin (tsv);

-- token_count is included so the BM25 corpus statistics (doc count, average
-- length) can be gathered with an index-only scan.
create index if not exists book_chunks_scope_idx
  on book_chunks (series_id, book_number)
  include (token_count);

-- Okapi BM25 over the same spoiler-bounded scope as the dense retriever.
-- Candidates match at least one query lexeme, so document frequencies computed
-- over that set are exact for the scope.
create or replace function bm25_book_chunks (
  query_text text,
  filter_series text,
  max_book_limit integer,
  match_count integer default 40,
  k1 double precision default 1.2,
  b double precision default 0.75
)
returns table (
  id bigint,
  series_id text,
  book_number integer,
  chapter_number integer,
  chunk_index integer,
  content text,
  score double precision
)
language sql
stable
as $$
  with query_terms as (
    select distinct t.lexeme
    from unnest(to_tsvector('english', query_text)) as t(lexeme, positions, weights)
  ),
  query_tsquery as (
    -- Lexemes are already normalized, so quote them into a raw OR tsquery
    -- instead of letting to_tsquery stem them a second time.
    select string_agg(quote_literal(qt.lexeme), ' | ')::tsquery as tsq
    from query_terms qt
  ),
  scope as (
    select bc.id, bc.series_id, bc.book_number, bc.chapter_number,
           bc.chunk_index, bc.content, bc.tsv, bc.token_count
    from book_chunks bc
    where bc.series_id = filter_series
      and bc.book_number <= max_book_limit
  ),
  corpus as (
    select count(*)::double precision as n_docs,
           nullif(avg(s.token_count), 0)::double precision as avg_len
    from scope s
  ),
  candidates as (
    select s.*
    from scope s, query_tsquery q
    where q.tsq is not null
      and s.tsv @@ q.tsq
  ),
  doc_terms as (
    select c.id as doc_id,
           t.lexeme as lexeme,
           coalesce(array_length(t.positions, 1), 1)::double precision as tf,
           c.token_count as token_count
    from candidates c,
         unnest(c.tsv) as t(lexeme, positions, weights)
    where t.lexeme in (select qt.lexeme from query_terms qt)
  ),
  doc_freq as (
    select dt.lexeme as lexeme,
           count(distinct dt.doc_id)::double precision as doc_count
    from doc_terms dt
    group by dt.lexeme
  ),
  scored as (
    select dt.doc_id as doc_id,
           sum(
             ln(1 + (corpus.n_docs - dfq.doc_count + 0.5) / (dfq.doc_count + 0.5))
             * (dt.tf * (k1 + 1))
             / (
                 dt.tf
                 + k1 * (
                     1 - b
                     + b * (dt.token_count::double precision
                            / coalesce(corpus.avg_len, 1))
                   )
               )
           ) as score
    from doc_terms dt
    join doc_freq dfq on dfq.lexeme = dt.lexeme
    cross join corpus
    group by dt.doc_id
  )
  select c.id, c.series_id, c.book_number, c.chapter_number, c.chunk_index,
         c.content, sc.score
  from scored sc
  join candidates c on c.id = sc.doc_id
  order by sc.score desc, c.id
  limit match_count;
$$;
