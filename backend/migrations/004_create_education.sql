-- 004_create_education
-- Education history for user profiles.

create table if not exists education (
  id             uuid         primary key default gen_random_uuid(),
  user_id        uuid         not null references auth.users(id) on delete cascade,
  institution    text         not null,
  degree         text         not null,
  field_of_study text         not null,
  start_year     integer      not null check (start_year >= 1900),
  end_year       integer      check (end_year is null or end_year >= start_year),
  gpa            numeric(3,2) check (gpa is null or (gpa >= 0 and gpa <= 9.99)),
  description    text,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists education_user_year_idx
  on education (user_id, start_year desc);

alter table education enable row level security;

drop policy if exists "Users manage own education" on education;
create policy "Users manage own education"
  on education
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- update_updated_at() is defined in 001_create_jobs.sql and shared across tables.
drop trigger if exists education_updated_at on education;
create trigger education_updated_at
  before update on education
  for each row execute function update_updated_at();
