-- SquadView Twitch account support
-- 2026-08-22
-- Run in the SquadView Supabase project's SQL editor.

create table if not exists public.squadview_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  twitch_user_id text,
  twitch_login text,
  display_name text not null default 'Twitch user',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.squadview_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorite_streamers text[] not null default '{}',
  last_channels text[] not null default '{}',
  default_view text not null default 'smart'
    check (default_view in ('smart', 'dual', 'chat', 'solo')),
  saved_squads jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.squadview_profiles enable row level security;
alter table public.squadview_user_state enable row level security;

drop policy if exists "Users can read own SquadView profile" on public.squadview_profiles;
create policy "Users can read own SquadView profile"
on public.squadview_profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own SquadView profile" on public.squadview_profiles;
create policy "Users can insert own SquadView profile"
on public.squadview_profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own SquadView profile" on public.squadview_profiles;
create policy "Users can update own SquadView profile"
on public.squadview_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own SquadView state" on public.squadview_user_state;
create policy "Users can read own SquadView state"
on public.squadview_user_state for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own SquadView state" on public.squadview_user_state;
create policy "Users can insert own SquadView state"
on public.squadview_user_state for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own SquadView state" on public.squadview_user_state;
create policy "Users can update own SquadView state"
on public.squadview_user_state for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.squadview_profiles to authenticated;
grant select, insert, update on public.squadview_user_state to authenticated;

comment on table public.squadview_user_state is
  'Per-user SquadView sync state. saved_squads is reserved for the named Saved Squads UI.';
