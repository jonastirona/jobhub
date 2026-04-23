-- 006_create_experience
-- Work experience entries for user profiles.

create table if not exists experience (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null,
  company     text        not null,
  location    text,
  start_year  integer     not null check (start_year >= 1900),
  end_year    integer     check (end_year is null or end_year >= start_year),
  description text,
  position    integer     not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint experience_user_id_position_key unique (user_id, position)
);

-- Note: no separate index needed — the UNIQUE (user_id, position) constraint
-- above already creates an implicit index on (user_id, position).

alter table experience enable row level security;

drop policy if exists "Users can manage their own experience" on experience;
create policy "Users can manage their own experience"
  on experience
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- update_updated_at() is defined in 001_create_jobs.sql and shared across tables.
drop trigger if exists experience_updated_at on experience;
create trigger experience_updated_at
  before update on experience
  for each row execute function update_updated_at();
