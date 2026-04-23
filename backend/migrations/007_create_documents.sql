-- 007_create_documents
-- User-owned document records with optional link to a job application.

create table if not exists documents (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  job_id      uuid        references jobs(id) on delete set null,
  name        text        not null,
  doc_type    text        not null default 'Draft',
  content     text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists documents_user_id_idx on documents (user_id);
create index if not exists documents_user_job_idx on documents (user_id, job_id);

alter table documents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'documents'
      and policyname = 'Users can manage their own documents'
  ) then
    create policy "Users can manage their own documents"
      on documents
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- update_updated_at() is defined in 001_create_jobs.sql and shared across tables.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'documents_updated_at'
      and tgrelid = 'public.documents'::regclass
      and not tgisinternal
  ) then
    create trigger documents_updated_at
      before update on documents
      for each row execute function update_updated_at();
  end if;
end $$;
