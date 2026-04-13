-- 003_create_job_status_history
-- Run once in the Supabase SQL editor.

create table if not exists job_status_history (
  id          uuid        primary key default gen_random_uuid(),
  job_id      uuid        not null references jobs(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  from_status text,
  to_status   text        not null,
  changed_at  timestamptz not null default now()
);

create index if not exists job_status_history_job_idx on job_status_history (job_id, changed_at desc);

alter table job_status_history enable row level security;

drop policy if exists "Users can manage their own job status history" on job_status_history;
create policy "Users can manage their own job status history"
  on job_status_history
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
