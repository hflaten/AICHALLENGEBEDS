create extension if not exists vector with schema extensions;

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

revoke execute on function public.match_lead_companies(extensions.vector, float, int) from public;
revoke execute on function public.match_lead_companies(extensions.vector, float, int) from anon, authenticated;
grant execute on function public.match_lead_companies(extensions.vector, float, int) to service_role;

notify pgrst, 'reload schema';
