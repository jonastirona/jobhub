-- 012_create_documents_bucket
-- Supabase Storage bucket and policies for user-scoped document files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Users can only access files inside their own top-level folder: <auth.uid()>/...
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can read own documents'
  ) then
    create policy "Users can read own documents"
      on storage.objects
      for select
      using (
        bucket_id = 'documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own documents'
  ) then
    create policy "Users can upload own documents"
      on storage.objects
      for insert
      with check (
        bucket_id = 'documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own documents'
  ) then
    create policy "Users can delete own documents"
      on storage.objects
      for delete
      using (
        bucket_id = 'documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
