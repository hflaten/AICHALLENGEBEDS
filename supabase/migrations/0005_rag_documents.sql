create extension if not exists vector with schema extensions;

create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_id text not null unique,
  doc_type text not null,
  company_name text,
  org_id text,
  sector text,
  trigger_name text,
  event_date date,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536)
);

alter table public.rag_documents add column if not exists updated_at timestamptz not null default now();
alter table public.rag_documents add column if not exists source_id text;
alter table public.rag_documents add column if not exists doc_type text not null default 'document';
alter table public.rag_documents add column if not exists company_name text;
alter table public.rag_documents add column if not exists org_id text;
alter table public.rag_documents add column if not exists sector text;
alter table public.rag_documents add column if not exists trigger_name text;
alter table public.rag_documents add column if not exists event_date date;
alter table public.rag_documents add column if not exists content text not null default '';
alter table public.rag_documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.rag_documents add column if not exists embedding extensions.vector(1536);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rag_documents_source_id_key'
      and conrelid = 'public.rag_documents'::regclass
  ) then
    alter table public.rag_documents
      add constraint rag_documents_source_id_key unique (source_id);
  end if;
end $$;

alter table public.rag_documents enable row level security;
revoke all on table public.rag_documents from anon, authenticated;

create index if not exists rag_documents_created_at_idx
  on public.rag_documents (created_at desc);

create index if not exists rag_documents_company_name_idx
  on public.rag_documents (company_name);

create index if not exists rag_documents_doc_type_idx
  on public.rag_documents (doc_type);

create index if not exists rag_documents_embedding_hnsw_idx
  on public.rag_documents
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_rag_documents (
  query_embedding extensions.vector(1536),
  match_threshold float default 0.2,
  match_count int default 12
)
returns table (
  id uuid,
  source_id text,
  doc_type text,
  company_name text,
  org_id text,
  sector text,
  trigger_name text,
  event_date date,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    rag_documents.id,
    rag_documents.source_id,
    rag_documents.doc_type,
    rag_documents.company_name,
    rag_documents.org_id,
    rag_documents.sector,
    rag_documents.trigger_name,
    rag_documents.event_date,
    rag_documents.content,
    rag_documents.metadata,
    1 - (rag_documents.embedding <=> query_embedding) as similarity
  from public.rag_documents
  where rag_documents.embedding is not null
    and 1 - (rag_documents.embedding <=> query_embedding) >= match_threshold
  order by rag_documents.embedding <=> query_embedding
  limit least(match_count, 40);
$$;

revoke execute on function public.match_rag_documents(extensions.vector, float, int) from public;
revoke execute on function public.match_rag_documents(extensions.vector, float, int) from anon, authenticated;
grant execute on function public.match_rag_documents(extensions.vector, float, int) to service_role;

notify pgrst, 'reload schema';
