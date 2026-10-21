-- SquadView paid Premium / Stripe billing hardening
-- 2026-10-17
-- Safe to run after the existing 20260828 monetization foundation.

begin;

do $squadview_billing_schema_guard$
begin
  if pg_catalog.to_regclass('public.squadview_billing_customers') is null then
    raise exception 'SquadView billing guard: public.squadview_billing_customers is missing';
  end if;
  if pg_catalog.to_regclass('public.squadview_subscriptions') is null then
    raise exception 'SquadView billing guard: public.squadview_subscriptions is missing';
  end if;
  if pg_catalog.to_regclass('public.squadview_entitlements') is null then
    raise exception 'SquadView billing guard: public.squadview_entitlements is missing';
  end if;
end;
$squadview_billing_schema_guard$;

alter table public.squadview_subscriptions
  add column if not exists billing_interval text,
  add column if not exists provider_event_id text,
  add column if not exists provider_event_created_at timestamptz;

do $squadview_interval_check$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'squadview_subscriptions_billing_interval_check'
      and conrelid = 'public.squadview_subscriptions'::regclass
  ) then
    alter table public.squadview_subscriptions
      add constraint squadview_subscriptions_billing_interval_check
      check (billing_interval is null or billing_interval in ('monthly', 'annual'));
  end if;
end;
$squadview_interval_check$;

create index if not exists squadview_subscriptions_user_provider_updated_idx
  on public.squadview_subscriptions(user_id, provider, updated_at desc);

comment on column public.squadview_subscriptions.billing_interval is
  'SquadView Premium billing cadence derived from the trusted Stripe price ID.';
comment on column public.squadview_subscriptions.provider_event_id is
  'Most recent Stripe event applied to this subscription row.';
comment on column public.squadview_subscriptions.provider_event_created_at is
  'Stripe event creation time used to ignore older out-of-order subscription events.';

commit;

select jsonb_build_object(
  'billing_interval_installed', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'squadview_subscriptions' and column_name = 'billing_interval'
  ),
  'event_timestamp_installed', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'squadview_subscriptions' and column_name = 'provider_event_created_at'
  )
) as squadview_stripe_premium_migration;
