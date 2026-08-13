do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_companies_name_key'
      and conrelid = 'public.lead_companies'::regclass
  ) then
    alter table public.lead_companies
      add constraint lead_companies_name_key unique (name);
  end if;
end $$;
