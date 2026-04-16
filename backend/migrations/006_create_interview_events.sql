-- 006_create_interview_events
-- Run once in the Supabase SQL editor.

create table if not exists interview_events (
  id           uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  round_type    text not null,
  scheduled_at  timestamptz not null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists interview_events_user_job_scheduled_idx
  on interview_events (user_id, job_id, scheduled_at desc);

create index if not exists interview_events_job_scheduled_idx
  on interview_events (job_id, scheduled_at desc);

alter table interview_events enable row level security;

drop policy if exists "Users can manage their own interview events" on interview_events;
create policy "Users can manage their own interview events"
  on interview_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists interview_events_updated_at on interview_events;
create trigger interview_events_updated_at
  before update on interview_events
  for each row execute function update_updated_at();
