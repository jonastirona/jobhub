-- 013_documents_storage_metadata
-- Store document files in Supabase Storage and keep metadata in documents table.

alter table if exists documents
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists original_filename text;

-- Existing draft-content rows may not have storage files yet.
-- Dropping NOT NULL allows legacy rows to remain readable in list views.
alter table if exists documents
  alter column content drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_mime_type_pdf_only'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_mime_type_pdf_only
      check (mime_type is null or mime_type = 'application/pdf');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_file_size_max_10mb'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_file_size_max_10mb
      check (file_size is null or (file_size > 0 and file_size <= 10485760));
  end if;
end $$;

create index if not exists documents_user_storage_path_idx
  on documents (user_id, storage_path);
