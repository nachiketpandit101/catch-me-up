-- Spoiler-free catch-up: core schema with pgvector metadata filtering
create extension if not exists vector;

create table if not exists series (
  id text primary key,
  title text not null
);

create table if not exists books (
  id text primary key,
  series_id text not null references series (id) on delete cascade,
  book_number integer not null,
  title text not null,
  unique (series_id, book_number)
);

create table if not exists book_chunks (
  id bigint generated always as identity primary key,
  series_id text not null references series (id) on delete cascade,
  book_number integer not null,
  chapter_number integer not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(768) not null,
  unique (series_id, book_number, chapter_number, chunk_index)
);

create index if not exists book_chunks_embedding_idx
  on book_chunks
  using hnsw (embedding vector_cosine_ops);

-- Hard filter on series + max book before similarity scoring
create or replace function match_book_chunks (
  query_embedding vector(768),
  filter_series text,
  max_book_limit integer,
  match_threshold float default 0.7,
  match_count integer default 5
)
returns table (
  id bigint,
  series_id text,
  book_number integer,
  chapter_number integer,
  chunk_index integer,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    bc.id,
    bc.series_id,
    bc.book_number,
    bc.chapter_number,
    bc.chunk_index,
    bc.content,
    (1 - (bc.embedding <=> query_embedding))::float as similarity
  from book_chunks bc
  where bc.series_id = filter_series
    and bc.book_number <= max_book_limit
    and 1 - (bc.embedding <=> query_embedding) > match_threshold
  order by bc.embedding <=> query_embedding
  limit match_count;
$$;

insert into series (id, title)
values ('red-rising', 'Red Rising')
on conflict (id) do nothing;

insert into books (id, series_id, book_number, title)
values
  ('red-rising-1', 'red-rising', 1, 'Red Rising'),
  ('red-rising-2', 'red-rising', 2, 'Golden Son')
on conflict (id) do nothing;
