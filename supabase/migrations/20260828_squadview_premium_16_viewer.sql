-- SquadView Phase 2.1
-- Premium viewer roster expansion: Free stays at 8, Premium supports 16.

begin;

alter table public.squadview_entitlements
  drop constraint if exists squadview_entitlements_viewer_max_streams_check;

alter table public.squadview_entitlements
  add constraint squadview_entitlements_viewer_max_streams_check
  check (viewer_max_streams between 1 and 16);

-- Existing Premium/test Premium accounts should immediately receive the new
-- viewer roster allowance. Free accounts remain unchanged at 8.
update public.squadview_entitlements
set
  viewer_max_streams = 16,
  updated_at = now()
where plan_key <> 'free';

commit;

-- Verification
select
  p.display_name,
  p.twitch_login,
  e.plan_key,
  e.viewer_max_streams,
  e.max_squad_members,
  e.saved_squad_limit
from public.squadview_profiles p
join public.squadview_entitlements e on e.user_id = p.user_id
order by p.created_at;
