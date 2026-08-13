create extension if not exists vector with schema extensions;

insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'processing',
  file_name text not null,
  content_type text,
  storage_bucket text,
  storage_path text,
  file_size bigint,
  project_title text,
  project_summary text,
  document_count int not null default 0,
  chunk_count int not null default 0,
  company_count int not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.ingestion_runs enable row level security;
revoke all on table public.ingestion_runs from anon, authenticated;

create index if not exists ingestion_runs_created_at_idx
  on public.ingestion_runs (created_at desc);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  file_name text not null,
  content_type text,
  storage_bucket text not null,
  storage_path text not null,
  file_size bigint,
  extracted_text text not null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.source_documents enable row level security;
revoke all on table public.source_documents from anon, authenticated;

create index if not exists source_documents_created_at_idx
  on public.source_documents (created_at desc);

create index if not exists source_documents_ingestion_run_id_idx
  on public.source_documents (ingestion_run_id);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  chunk_index int not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536)
);

alter table public.document_chunks enable row level security;
revoke all on table public.document_chunks from anon, authenticated;

create index if not exists document_chunks_source_document_id_idx
  on public.document_chunks (source_document_id);

create index if not exists document_chunks_ingestion_run_id_idx
  on public.document_chunks (ingestion_run_id);

create unique index if not exists document_chunks_source_chunk_key
  on public.document_chunks (source_document_id, chunk_index);

create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_document_chunks (
  query_embedding extensions.vector(1536),
  match_threshold float default 0.2,
  match_count int default 12
)
returns table (
  id uuid,
  source_document_id uuid,
  ingestion_run_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  file_name text,
  storage_path text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    document_chunks.id,
    document_chunks.source_document_id,
    document_chunks.ingestion_run_id,
    document_chunks.chunk_index,
    document_chunks.content,
    document_chunks.metadata,
    source_documents.file_name,
    source_documents.storage_path,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from public.document_chunks
  join public.source_documents on source_documents.id = document_chunks.source_document_id
  where document_chunks.embedding is not null
    and 1 - (document_chunks.embedding <=> query_embedding) >= match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit least(match_count, 40);
$$;

revoke execute on function public.match_document_chunks(extensions.vector, float, int) from public;
revoke execute on function public.match_document_chunks(extensions.vector, float, int) from anon, authenticated;
grant execute on function public.match_document_chunks(extensions.vector, float, int) to service_role;

notify pgrst, 'reload schema';
