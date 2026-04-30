-- 016_add_documents_status_tags
-- Add status and tags columns to documents table.

alter table if exists documents
  add column if not exists status text,
  add column if not exists tags text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_status_allowed_values'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_status_allowed_values
      check (status is null or status in ('draft','final','archived'));
  end if;
end $$;

create index if not exists documents_user_tags_idx on documents using gin (tags);
