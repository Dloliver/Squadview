-- SquadView Unified Twitch Phase 1.0
-- Secure server-side Twitch connection foundation.
-- 2026-08-31
--
-- Token values are encrypted by the Edge Function before they are written here.
-- Browser roles receive no SELECT/INSERT/UPDATE/DELETE privileges on this table.

begin;

create table if not exists public.squadview_twitch_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  twitch_user_id text not null,
  twitch_login text,
  twitch_client_id text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  scopes text[] not null default '{}',
  access_token_expires_at timestamptz,
  last_validated_at timestamptz,
  reconnect_required boolean not null default false,
  token_version bigint not null default 1 check (token_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists squadview_twitch_connections_twitch_user_id_idx
  on public.squadview_twitch_connections(twitch_user_id);

alter table public.squadview_twitch_connections enable row level security;

revoke all on table public.squadview_twitch_connections from public;
revoke all on table public.squadview_twitch_connections from anon;
revoke all on table public.squadview_twitch_connections from authenticated;
grant all on table public.squadview_twitch_connections to service_role;

comment on table public.squadview_twitch_connections is
  'Server-only Twitch OAuth connection state for SquadView. OAuth tokens are encrypted by the Edge Function and are never readable through ordinary authenticated browser queries.';

comment on column public.squadview_twitch_connections.access_token_ciphertext is
  'AES-GCM encrypted Twitch user access token. Never expose through client APIs.';

comment on column public.squadview_twitch_connections.refresh_token_ciphertext is
  'AES-GCM encrypted Twitch refresh token when Supabase/Twitch returns one. Never expose through client APIs.';

commit;
