-- 003_add_deadline_recruiter_notes_to_jobs
-- Run in Supabase SQL editor if jobs already existed without these columns.

alter table jobs add column if not exists deadline date;
alter table jobs add column if not exists recruiter_notes text;
