-- SquadView monetization and Saved Squads foundation
-- 2026-08-28
-- Run in the SquadView Supabase project SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.squadview_billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.squadview_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  provider_subscription_id text unique,
  provider_price_id text,
  plan_key text not null default 'free',
  status text not null default 'inactive',
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists squadview_subscriptions_user_id_idx
  on public.squadview_subscriptions(user_id);

create table if not exists public.squadview_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_key text not null default 'free',
  squadview_ads boolean not null default true,
  saved_squad_limit integer default 3 check (saved_squad_limit is null or saved_squad_limit > 0),
  max_squad_members integer not null default 8 check (max_squad_members between 1 and 16),
  viewer_max_streams integer not null default 8 check (viewer_max_streams between 1 and 8),
  youtube_companion boolean not null default false,
  multi_window boolean not null default false,
  live_squad_alerts boolean not null default false,
  persistent_shared_squads boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.squadview_entitlements (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.squadview_create_default_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.squadview_entitlements (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists squadview_default_entitlements_on_signup on auth.users;
create trigger squadview_default_entitlements_on_signup
after insert on auth.users
for each row execute function public.squadview_create_default_entitlements();

create table if not exists public.squadview_saved_squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  alerts_enabled boolean not null default false,
  share_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists squadview_saved_squads_user_id_idx
  on public.squadview_saved_squads(user_id);

create table if not exists public.squadview_saved_squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squadview_saved_squads(id) on delete cascade,
  twitch_login text not null check (twitch_login ~ '^[a-z0-9_]{1,25}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (squad_id, twitch_login)
);

create index if not exists squadview_saved_squad_members_squad_id_idx
  on public.squadview_saved_squad_members(squad_id);

create or replace function public.squadview_enforce_saved_squad_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_limit integer;
  current_count integer;
begin
  select saved_squad_limit
    into allowed_limit
  from public.squadview_entitlements
  where user_id = new.user_id;

  if not found then
    allowed_limit := 3;
  end if;

  if allowed_limit is not null then
    select count(*)
      into current_count
    from public.squadview_saved_squads
    where user_id = new.user_id
      and (tg_op = 'INSERT' or id <> new.id);

    if current_count >= allowed_limit then
      raise exception using
        errcode = 'P0001',
        message = 'saved_squad_limit_reached';
    end if;
  end if;

  if new.alerts_enabled then
    if not coalesce((
      select live_squad_alerts
      from public.squadview_entitlements
      where user_id = new.user_id
    ), false) then
      raise exception using errcode = 'P0001', message = 'live_squad_alerts_requires_premium';
    end if;
  end if;

  if new.share_slug is not null then
    if not coalesce((
      select persistent_shared_squads
      from public.squadview_entitlements
      where user_id = new.user_id
    ), false) then
      raise exception using errcode = 'P0001', message = 'persistent_shared_squads_requires_premium';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists squadview_saved_squad_limit_guard on public.squadview_saved_squads;
create trigger squadview_saved_squad_limit_guard
before insert or update on public.squadview_saved_squads
for each row execute function public.squadview_enforce_saved_squad_limit();

create or replace function public.squadview_enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  allowed_members integer;
  current_count integer;
begin
  select user_id into owner_id
  from public.squadview_saved_squads
  where id = new.squad_id;

  if owner_id is null then
    raise exception using errcode = 'P0001', message = 'saved_squad_not_found';
  end if;

  select max_squad_members into allowed_members
  from public.squadview_entitlements
  where user_id = owner_id;

  if not found then
    allowed_members := 8;
  end if;

  select count(*) into current_count
  from public.squadview_saved_squad_members
  where squad_id = new.squad_id
    and (tg_op = 'INSERT' or id <> new.id);

  if current_count >= allowed_members then
    raise exception using errcode = 'P0001', message = 'saved_squad_member_limit_reached';
  end if;

  new.twitch_login := lower(trim(new.twitch_login));
  return new;
end;
$$;

drop trigger if exists squadview_saved_squad_member_limit_guard on public.squadview_saved_squad_members;
create trigger squadview_saved_squad_member_limit_guard
before insert or update on public.squadview_saved_squad_members
for each row execute function public.squadview_enforce_member_limit();

alter table public.squadview_billing_customers enable row level security;
alter table public.squadview_subscriptions enable row level security;
alter table public.squadview_entitlements enable row level security;
alter table public.squadview_saved_squads enable row level security;
alter table public.squadview_saved_squad_members enable row level security;

drop policy if exists "Users can read own SquadView subscription" on public.squadview_subscriptions;
create policy "Users can read own SquadView subscription"
on public.squadview_subscriptions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own SquadView entitlements" on public.squadview_entitlements;
create policy "Users can read own SquadView entitlements"
on public.squadview_entitlements for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own saved Squads" on public.squadview_saved_squads;
create policy "Users can read own saved Squads"
on public.squadview_saved_squads for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own saved Squads" on public.squadview_saved_squads;
create policy "Users can create own saved Squads"
on public.squadview_saved_squads for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own saved Squads" on public.squadview_saved_squads;
create policy "Users can update own saved Squads"
on public.squadview_saved_squads for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own saved Squads" on public.squadview_saved_squads;
create policy "Users can delete own saved Squads"
on public.squadview_saved_squads for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read members of own saved Squads" on public.squadview_saved_squad_members;
create policy "Users can read members of own saved Squads"
on public.squadview_saved_squad_members for select
to authenticated
using (exists (
  select 1 from public.squadview_saved_squads squad
  where squad.id = squad_id and squad.user_id = auth.uid()
));

drop policy if exists "Users can create members in own saved Squads" on public.squadview_saved_squad_members;
create policy "Users can create members in own saved Squads"
on public.squadview_saved_squad_members for insert
to authenticated
with check (exists (
  select 1 from public.squadview_saved_squads squad
  where squad.id = squad_id and squad.user_id = auth.uid()
));

drop policy if exists "Users can update members in own saved Squads" on public.squadview_saved_squad_members;
create policy "Users can update members in own saved Squads"
on public.squadview_saved_squad_members for update
to authenticated
using (exists (
  select 1 from public.squadview_saved_squads squad
  where squad.id = squad_id and squad.user_id = auth.uid()
))
with check (exists (
  select 1 from public.squadview_saved_squads squad
  where squad.id = squad_id and squad.user_id = auth.uid()
));

drop policy if exists "Users can delete members in own saved Squads" on public.squadview_saved_squad_members;
create policy "Users can delete members in own saved Squads"
on public.squadview_saved_squad_members for delete
to authenticated
using (exists (
  select 1 from public.squadview_saved_squads squad
  where squad.id = squad_id and squad.user_id = auth.uid()
));

grant select on public.squadview_subscriptions to authenticated;
grant select on public.squadview_entitlements to authenticated;
grant select, insert, update, delete on public.squadview_saved_squads to authenticated;
grant select, insert, update, delete on public.squadview_saved_squad_members to authenticated;

-- Authenticated users can create a Squad atomically. Database triggers enforce
-- the Free versus Premium limits, so changing browser JavaScript cannot unlock
-- additional Saved Squads or larger creator groups.
create or replace function public.create_squadview_saved_squad(
  p_name text,
  p_channels text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_squad_id uuid;
  channel_value text;
  cleaned_channel text;
  position_index integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  insert into public.squadview_saved_squads (user_id, name)
  values (auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'My Squad'), 60))
  returning id into new_squad_id;

  foreach channel_value in array coalesce(p_channels, array[]::text[]) loop
    cleaned_channel := lower(regexp_replace(coalesce(channel_value, ''), '[^a-zA-Z0-9_]', '', 'g'));
    if cleaned_channel <> '' then
      insert into public.squadview_saved_squad_members (squad_id, twitch_login, sort_order)
      values (new_squad_id, cleaned_channel, position_index)
      on conflict (squad_id, twitch_login) do nothing;
      position_index := position_index + 1;
    end if;
  end loop;

  if not exists (
    select 1 from public.squadview_saved_squad_members where squad_id = new_squad_id
  ) then
    raise exception using errcode = 'P0001', message = 'saved_squad_requires_member';
  end if;

  return new_squad_id;
end;
$$;

grant execute on function public.create_squadview_saved_squad(text, text[]) to authenticated;

comment on table public.squadview_entitlements is
  'Server authoritative SquadView feature access. Clients may read their row but cannot write it.';
comment on table public.squadview_saved_squads is
  'Named reusable Twitch creator groups. Free and Premium limits are enforced by database triggers.';
