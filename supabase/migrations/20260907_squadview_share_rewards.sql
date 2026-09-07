-- SquadView Share + Referral Rewards
-- Live-schema corrected migration
-- 2026-09-07
--
-- Validated against the live SquadView Supabase schema on 2026-09-07.
--
-- Growth loop:
--   Every 5 qualified new users referred -> 30 days of Premium.
--   Rewards repeat and stack.
--   100 qualified referrals -> Lifetime Premium.
--
-- Referral qualification is server-authoritative. Browser roles cannot directly
-- write referral counts, promotional entitlement dates, or Lifetime Premium.
--
-- Important live-schema detail:
--   pgcrypto is installed in the `extensions` schema. Security-definer
--   functions therefore schema-qualify extensions.gen_random_bytes().

begin;

-- Fail clearly rather than partially adapting to the wrong Supabase project.
do $squadview_live_schema_guard$
begin
  if pg_catalog.to_regclass('public.squadview_entitlements') is null then
    raise exception 'SquadView live-schema guard: public.squadview_entitlements is missing';
  end if;

  if pg_catalog.to_regclass('public.squadview_profiles') is null then
    raise exception 'SquadView live-schema guard: public.squadview_profiles is missing';
  end if;

  if pg_catalog.to_regclass('public.squadview_saved_squads') is null then
    raise exception 'SquadView live-schema guard: public.squadview_saved_squads is missing';
  end if;

  if pg_catalog.to_regclass('public.squadview_saved_squad_members') is null then
    raise exception 'SquadView live-schema guard: public.squadview_saved_squad_members is missing';
  end if;

  if pg_catalog.to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'SquadView live-schema guard: extensions.gen_random_bytes(integer) is missing';
  end if;
end;
$squadview_live_schema_guard$;

alter table public.squadview_entitlements
  add column if not exists promo_premium_until timestamptz,
  add column if not exists lifetime_premium boolean not null default false;

create table if not exists public.squadview_referral_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{6,16}$'),
  qualified_referrals integer not null default 0 check (qualified_referrals >= 0),
  reward_months_earned integer not null default 0 check (reward_months_earned >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.squadview_referrals (
  id uuid primary key default extensions.gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referred_twitch_user_id text not null unique,
  referral_code text not null,
  qualified_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  check (referrer_user_id <> referred_user_id)
);

create index if not exists squadview_referrals_referrer_idx
  on public.squadview_referrals(referrer_user_id, qualified_at desc);

alter table public.squadview_referral_accounts enable row level security;
alter table public.squadview_referrals enable row level security;

-- Referral tables are RPC/service owned. Signed-in browser clients do not get
-- direct table privileges; they only receive the safe RPC responses below.
revoke all on table public.squadview_referral_accounts from public, anon, authenticated;
revoke all on table public.squadview_referrals from public, anon, authenticated;
grant all on table public.squadview_referral_accounts to service_role;
grant all on table public.squadview_referrals to service_role;

-- Referral accounts are intentionally lazy-created. This avoids adding another
-- auth.users trigger and means only users who actually use Share/Rewards need a
-- referral-account row.
create or replace function public.squadview_create_referral_account_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  candidate_code text;
begin
  if p_user_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.squadview_referral_accounts
    where user_id = p_user_id
  ) then
    return;
  end if;

  loop
    -- 64 bits of random material represented as 16 uppercase hexadecimal
    -- characters. The table's unique constraint remains authoritative for the
    -- extremely unlikely collision case.
    candidate_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));

    begin
      insert into public.squadview_referral_accounts (user_id, referral_code)
      values (p_user_id, candidate_code)
      on conflict (user_id) do nothing;

      -- Either this call inserted the row, or another concurrent request did.
      return;
    exception when unique_violation then
      -- Referral-code collision. Generate another code.
    end;
  end loop;
end;
$$;

revoke all on function public.squadview_create_referral_account_for_user(uuid)
  from public, anon, authenticated;

-- This helper is intentionally limited to referral/lifetime promotional access.
-- Existing paid-plan feature flags continue to behave exactly as they did before
-- this migration.
create or replace function public.squadview_user_has_referral_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select
      e.lifetime_premium
      or (
        e.promo_premium_until is not null
        and e.promo_premium_until > pg_catalog.now()
      )
    from public.squadview_entitlements e
    where e.user_id = p_user_id
  ), false);
$$;

revoke all on function public.squadview_user_has_referral_premium(uuid)
  from public, anon, authenticated;

-- Preserve the existing Saved Squad enforcement model. Only an active referral
-- promotion/Lifetime reward overrides the normal stored entitlement values.
create or replace function public.squadview_enforce_saved_squad_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  allowed_limit integer;
  current_count integer;
  referral_premium boolean;
begin
  referral_premium := public.squadview_user_has_referral_premium(new.user_id);

  if referral_premium then
    allowed_limit := null;
  else
    select saved_squad_limit
      into allowed_limit
    from public.squadview_entitlements
    where user_id = new.user_id;

    if not found then
      allowed_limit := 3;
    end if;
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

  if new.alerts_enabled and not referral_premium then
    if not coalesce((
      select live_squad_alerts
      from public.squadview_entitlements
      where user_id = new.user_id
    ), false) then
      raise exception using
        errcode = 'P0001',
        message = 'live_squad_alerts_requires_premium';
    end if;
  end if;

  if new.share_slug is not null and not referral_premium then
    if not coalesce((
      select persistent_shared_squads
      from public.squadview_entitlements
      where user_id = new.user_id
    ), false) then
      raise exception using
        errcode = 'P0001',
        message = 'persistent_shared_squads_requires_premium';
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.squadview_enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  owner_id uuid;
  allowed_members integer;
  current_count integer;
begin
  select user_id
    into owner_id
  from public.squadview_saved_squads
  where id = new.squad_id;

  if owner_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'saved_squad_not_found';
  end if;

  if public.squadview_user_has_referral_premium(owner_id) then
    allowed_members := 16;
  else
    select max_squad_members
      into allowed_members
    from public.squadview_entitlements
    where user_id = owner_id;

    if not found then
      allowed_members := 8;
    end if;
  end if;

  select count(*)
    into current_count
  from public.squadview_saved_squad_members
  where squad_id = new.squad_id
    and (tg_op = 'INSERT' or id <> new.id);

  if current_count >= allowed_members then
    raise exception using
      errcode = 'P0001',
      message = 'saved_squad_member_limit_reached';
  end if;

  new.twitch_login := lower(trim(new.twitch_login));
  return new;
end;
$$;

-- The existing triggers already point at the two functions above. Replacing the
-- function bodies is enough; no trigger recreation is needed.

create or replace function public.get_squadview_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  account_row public.squadview_referral_accounts%rowtype;
  entitlement_row public.squadview_entitlements%rowtype;
begin
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'authentication_required';
  end if;

  perform public.squadview_create_referral_account_for_user(current_user_id);

  -- Existing SquadView auth normally creates this row already. Keep this
  -- defensive insert so Rewards also behaves safely if an older account is
  -- missing its entitlement record.
  insert into public.squadview_entitlements (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select *
    into account_row
  from public.squadview_referral_accounts
  where user_id = current_user_id;

  select *
    into entitlement_row
  from public.squadview_entitlements
  where user_id = current_user_id;

  return jsonb_build_object(
    'referral_code', account_row.referral_code,
    'qualified_referrals', account_row.qualified_referrals,
    'reward_months_earned', account_row.reward_months_earned,
    'promo_premium_until', entitlement_row.promo_premium_until,
    'lifetime_premium', entitlement_row.lifetime_premium
  );
end;
$$;

revoke all on function public.get_squadview_referral_summary()
  from public, anon, authenticated;
grant execute on function public.get_squadview_referral_summary()
  to authenticated;

create or replace function public.claim_squadview_referral(p_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  cleaned_code text := upper(trim(coalesce(p_referral_code, '')));
  referrer_id uuid;
  referred_twitch_id text;
  referrer_twitch_id text;
  account_created_at timestamptz;
  new_count integer;
  new_months integer;
  month_awarded boolean := false;
  lifetime_awarded boolean := false;
begin
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'authentication_required';
  end if;

  if cleaned_code !~ '^[A-Z0-9]{6,16}$' then
    return jsonb_build_object('status', 'invalid_referral');
  end if;

  select user_id
    into referrer_id
  from public.squadview_referral_accounts
  where referral_code = cleaned_code;

  if referrer_id is null then
    return jsonb_build_object('status', 'invalid_referral');
  end if;

  if referrer_id = current_user_id then
    return jsonb_build_object('status', 'self_referral');
  end if;

  select twitch_user_id
    into referred_twitch_id
  from public.squadview_profiles
  where user_id = current_user_id;

  if referred_twitch_id is null or trim(referred_twitch_id) = '' then
    return jsonb_build_object('status', 'twitch_identity_required');
  end if;

  select twitch_user_id
    into referrer_twitch_id
  from public.squadview_profiles
  where user_id = referrer_id;

  -- A valid referral owner should have completed Twitch-backed SquadView
  -- profile hydration before a referral code is shared.
  if referrer_twitch_id is null or trim(referrer_twitch_id) = '' then
    return jsonb_build_object('status', 'invalid_referral');
  end if;

  if referrer_twitch_id = referred_twitch_id then
    return jsonb_build_object('status', 'self_referral');
  end if;

  select created_at
    into account_created_at
  from auth.users
  where id = current_user_id;

  -- Referral credit is for genuinely new SquadView accounts. The claim occurs
  -- after the new user reaches the viewer, so 24 hours leaves room for OAuth,
  -- ad playback, and ordinary first-session use without allowing established
  -- accounts to be recycled as referrals.
  if account_created_at is null
     or account_created_at < pg_catalog.now() - interval '24 hours' then
    return jsonb_build_object('status', 'existing_user_not_eligible');
  end if;

  if exists (
    select 1
    from public.squadview_referrals
    where referred_user_id = current_user_id
       or referred_twitch_user_id = referred_twitch_id
  ) then
    return jsonb_build_object('status', 'already_claimed');
  end if;

  begin
    insert into public.squadview_referrals (
      referrer_user_id,
      referred_user_id,
      referred_twitch_user_id,
      referral_code
    ) values (
      referrer_id,
      current_user_id,
      referred_twitch_id,
      cleaned_code
    );
  exception when unique_violation then
    return jsonb_build_object('status', 'already_claimed');
  end;

  update public.squadview_referral_accounts
  set
    qualified_referrals = qualified_referrals + 1,
    reward_months_earned = floor((qualified_referrals + 1) / 5.0)::integer,
    updated_at = pg_catalog.now()
  where user_id = referrer_id
  returning qualified_referrals, reward_months_earned
  into new_count, new_months;

  insert into public.squadview_entitlements (user_id)
  values (referrer_id)
  on conflict (user_id) do nothing;

  if new_count >= 100 then
    update public.squadview_entitlements
    set
      lifetime_premium = true,
      updated_at = pg_catalog.now()
    where user_id = referrer_id
      and not lifetime_premium;

    lifetime_awarded := found;
  elsif mod(new_count, 5) = 0 then
    update public.squadview_entitlements
    set
      promo_premium_until = greatest(
        coalesce(promo_premium_until, pg_catalog.now()),
        pg_catalog.now()
      ) + interval '30 days',
      updated_at = pg_catalog.now()
    where user_id = referrer_id;

    month_awarded := true;
  end if;

  -- Do not expose the referrer's cumulative referral count to the referred
  -- account. The referrer sees that progress through their own summary RPC.
  return jsonb_build_object(
    'status', 'qualified',
    'month_awarded', month_awarded,
    'lifetime_awarded', lifetime_awarded
  );
end;
$$;

revoke all on function public.claim_squadview_referral(text)
  from public, anon, authenticated;
grant execute on function public.claim_squadview_referral(text)
  to authenticated;

comment on table public.squadview_referral_accounts is
  'Server-owned referral code and reward progress for SquadView accounts that use Share/Rewards.';
comment on table public.squadview_referrals is
  'One-time qualified SquadView referrals. A referred SquadView/Twitch identity can only count once.';
comment on column public.squadview_entitlements.promo_premium_until is
  'Stackable promotional Premium expiration, including repeatable 5-referral rewards.';
comment on column public.squadview_entitlements.lifetime_premium is
  'Permanent Premium entitlement. The early referral program awards this at 100 qualified referrals.';

commit;

-- One-result verification block for the Supabase SQL Editor.
select jsonb_pretty(
  jsonb_build_object(
    'referral_accounts',
      (select count(*) from public.squadview_referral_accounts),
    'qualified_referrals',
      (select count(*) from public.squadview_referrals),
    'promo_premium_column_installed',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'squadview_entitlements'
          and column_name = 'promo_premium_until'
      ),
    'lifetime_premium_column_installed',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'squadview_entitlements'
          and column_name = 'lifetime_premium'
      ),
    'referral_summary_rpc_installed',
      pg_catalog.to_regprocedure('public.get_squadview_referral_summary()') is not null,
    'claim_referral_rpc_installed',
      pg_catalog.to_regprocedure('public.claim_squadview_referral(text)') is not null,
    'referral_premium_helper_installed',
      pg_catalog.to_regprocedure('public.squadview_user_has_referral_premium(uuid)') is not null,
    'saved_squad_limit_guard_preserved',
      exists (
        select 1
        from information_schema.triggers
        where event_object_schema = 'public'
          and event_object_table = 'squadview_saved_squads'
          and trigger_name = 'squadview_saved_squad_limit_guard'
      ),
    'saved_squad_member_guard_preserved',
      exists (
        select 1
        from information_schema.triggers
        where event_object_schema = 'public'
          and event_object_table = 'squadview_saved_squad_members'
          and trigger_name = 'squadview_saved_squad_member_limit_guard'
      )
  )
) as squadview_share_rewards_verification;
