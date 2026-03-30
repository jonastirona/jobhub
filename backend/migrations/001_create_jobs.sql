-- Migration: 001_create_jobs
-- Run this once in the Supabase SQL editor for your project.

create table if not exists jobs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  company      text        not null,
  location     text,
  status       text        not null default 'applied',
  applied_date date,
  description  text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indexes for common query patterns (list by user, ordered by date)
create index if not exists jobs_user_id_idx on jobs (user_id);
create index if not exists jobs_user_created_idx on jobs (user_id, created_at desc);

-- Row-level security: users can only read/write their own jobs
alter table jobs enable row level security;

drop policy if exists "Users can manage their own jobs" on jobs;
create policy "Users can manage their own jobs"
  on jobs
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at current on every write
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_updated_at on jobs;
create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();
