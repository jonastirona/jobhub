-- 004_create_reminders
-- Run once in the Supabase SQL editor.

create table if not exists reminders (
  id            uuid        primary key default gen_random_uuid(),
  job_id        uuid        not null references jobs(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  title         text        not null,
  notes         text,
  due_date      timestamptz not null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists reminders_user_due_idx on reminders (user_id, due_date);

alter table reminders enable row level security;

drop policy if exists "Users can manage their own reminders" on reminders;
create policy "Users can manage their own reminders"
  on reminders
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
