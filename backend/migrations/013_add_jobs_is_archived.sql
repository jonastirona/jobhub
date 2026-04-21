-- 013_add_jobs_is_archived
-- Adds soft-archive support so jobs can be hidden/restored without deleting linked records.

alter table if exists jobs
  add column if not exists is_archived boolean not null default false;

-- Backfill legacy records that used status='archived' before soft-archive support.
update jobs
set is_archived = true
where lower(coalesce(status, '')) = 'archived';

create index if not exists jobs_user_archived_created_idx
  on jobs (user_id, is_archived, created_at desc);
