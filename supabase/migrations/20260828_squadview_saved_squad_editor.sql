-- SquadView Premium Phase 2
-- Adds an atomic Saved Squad editor RPC. Existing RLS and member-limit triggers
-- remain authoritative, so Free stays capped at 8 members and Premium at 16.

create or replace function public.update_squadview_saved_squad(
  p_squad_id uuid,
  p_name text,
  p_channels text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  channel_value text;
  cleaned_channel text;
  position_index integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.squadview_saved_squads
    where id = p_squad_id
      and user_id = auth.uid()
  ) then
    raise exception using errcode = 'P0001', message = 'saved_squad_not_found';
  end if;

  update public.squadview_saved_squads
  set
    name = left(coalesce(nullif(trim(p_name), ''), 'My Squad'), 60),
    updated_at = now()
  where id = p_squad_id
    and user_id = auth.uid();

  delete from public.squadview_saved_squad_members
  where squad_id = p_squad_id;

  foreach channel_value in array coalesce(p_channels, array[]::text[]) loop
    cleaned_channel := lower(regexp_replace(coalesce(channel_value, ''), '[^a-zA-Z0-9_]', '', 'g'));
    if cleaned_channel <> '' then
      insert into public.squadview_saved_squad_members (squad_id, twitch_login, sort_order)
      values (p_squad_id, cleaned_channel, position_index)
      on conflict (squad_id, twitch_login) do nothing;
      position_index := position_index + 1;
    end if;
  end loop;

  if not exists (
    select 1
    from public.squadview_saved_squad_members
    where squad_id = p_squad_id
  ) then
    raise exception using errcode = 'P0001', message = 'saved_squad_requires_member';
  end if;

  return p_squad_id;
end;
$$;

revoke all on function public.update_squadview_saved_squad(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.update_squadview_saved_squad(uuid, text, text[]) to authenticated;

comment on function public.update_squadview_saved_squad(uuid, text, text[]) is
  'Atomically renames and replaces a user-owned Saved Squad roster. Existing RLS and entitlement triggers enforce ownership and plan limits.';
