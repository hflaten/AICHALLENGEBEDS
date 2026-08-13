create extension if not exists vector with schema extensions;

create table if not exists public.lead_companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  website text,
  industry text,
  region text,
  company_size text,
  revenue_range text,
  description text not null,
  pain_points text[] not null default '{}'::text[],
  buying_signals text[] not null default '{}'::text[],
  services_fit text[] not null default '{}'::text[],
  contact_name text,
  contact_title text,
  contact_email text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536)
);

alter table public.lead_companies
  add constraint lead_companies_name_key unique (name);

alter table public.lead_companies enable row level security;
revoke all on table public.lead_companies from anon, authenticated;

create index if not exists lead_companies_created_at_idx
  on public.lead_companies (created_at desc);

create index if not exists lead_companies_industry_idx
  on public.lead_companies (industry);

create index if not exists lead_companies_region_idx
  on public.lead_companies (region);

create index if not exists lead_companies_embedding_hnsw_idx
  on public.lead_companies
  using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists public.lead_searches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request text not null,
  answer text not null,
  model text not null,
  embedding_model text not null,
  matched_company_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb
);

alter table public.lead_searches enable row level security;
revoke all on table public.lead_searches from anon, authenticated;

create index if not exists lead_searches_created_at_idx
  on public.lead_searches (created_at desc);

create or replace function public.match_lead_companies (
  query_embedding extensions.vector(1536),
  match_threshold float default 0.35,
  match_count int default 8
)
returns table (
  id uuid,
  name text,
  website text,
  industry text,
  region text,
  company_size text,
  revenue_range text,
  description text,
  pain_points text[],
  buying_signals text[],
  services_fit text[],
  contact_name text,
  contact_title text,
  contact_email text,
  source text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    lead_companies.id,
    lead_companies.name,
    lead_companies.website,
    lead_companies.industry,
    lead_companies.region,
    lead_companies.company_size,
    lead_companies.revenue_range,
    lead_companies.description,
    lead_companies.pain_points,
    lead_companies.buying_signals,
    lead_companies.services_fit,
    lead_companies.contact_name,
    lead_companies.contact_title,
    lead_companies.contact_email,
    lead_companies.source,
    1 - (lead_companies.embedding <=> query_embedding) as similarity
  from public.lead_companies
  where lead_companies.embedding is not null
    and 1 - (lead_companies.embedding <=> query_embedding) >= match_threshold
  order by lead_companies.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

revoke execute on function public.match_lead_companies(extensions.vector, float, int) from anon, authenticated;
grant execute on function public.match_lead_companies(extensions.vector, float, int) to service_role;
