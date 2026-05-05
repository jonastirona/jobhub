-- 018_add_document_versioning
-- Persist document version metadata and support version history queries.

alter table if exists documents
  add column if not exists version_group_id uuid,
  add column if not exists version_number integer,
  add column if not exists previous_version_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_previous_version_fk'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_previous_version_fk
      foreign key (previous_version_id)
      references public.documents(id)
      on delete set null;
  end if;
end $$;

-- Backfill legacy rows so existing documents become version-1 records.
update public.documents
set
  version_group_id = coalesce(version_group_id, id),
  version_number = coalesce(version_number, 1)
where version_group_id is null or version_number is null;

alter table if exists documents
  alter column version_group_id set not null,
  alter column version_group_id set default gen_random_uuid(),
  alter column version_number set not null,
  alter column version_number set default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_version_number_positive'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_version_number_positive
      check (version_number >= 1);
  end if;
end $$;

create index if not exists documents_user_version_group_idx
  on public.documents (user_id, version_group_id, version_number desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_version_group_number_unique'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_version_group_number_unique
      unique (user_id, version_group_id, version_number);
  end if;
end $$;
