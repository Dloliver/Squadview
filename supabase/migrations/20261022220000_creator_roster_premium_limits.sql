-- Phase 5.0B.2.5 — security-reviewed candidate; NOT AUTO-DEPLOYED.
-- Free 16, Premium 50. Existing published snapshots are preserved.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.squadview_creator_squad_members') IS NULL OR
    to_regclass('public.squadview_entitlements') IS NULL OR
    to_regprocedure('public.squadview_creator_save_draft(uuid,text,text,text,jsonb)') IS NULL OR
    to_regprocedure('public.squadview_creator_publish(uuid)') IS NULL THEN
   RAISE EXCEPTION 'Creator roster baseline missing; stop installation';
 END IF;
END; $guard$;

ALTER TABLE public.squadview_creator_squad_members
 DROP CONSTRAINT squadview_creator_squad_members_sort_order_check;
ALTER TABLE public.squadview_creator_squad_members
 ADD CONSTRAINT squadview_creator_squad_members_sort_order_check
 CHECK (sort_order BETWEEN 0 AND 49);

-- Disallow bypasses through direct PostgREST member mutation.
-- Owner RLS remains useful for SELECT; saves are performed by the definer RPC.
REVOKE INSERT, UPDATE, DELETE ON public.squadview_creator_squad_members FROM authenticated;

CREATE OR REPLACE FUNCTION public.squadview_creator_save_draft(
  p_squad_id uuid,
  p_slug text,
  p_title text,
  p_description text,
  p_channels jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_owner uuid;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := coalesce(p_description, '');
  v_count integer;
  v_premium boolean := false;
  v_limit integer := 16;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_squad_id IS NULL THEN
    RAISE EXCEPTION 'Squad id required';
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9_-]{2,39}$' THEN
    RAISE EXCEPTION 'Slug must be 3–40 lowercase letters, digits, underscores or hyphens';
  END IF;
  IF length(v_title) NOT BETWEEN 1 AND 80 OR length(v_description) > 500 THEN
    RAISE EXCEPTION 'Invalid title or description length';
  END IF;
  IF p_channels IS NULL OR jsonb_typeof(p_channels) <> 'array' THEN
    RAISE EXCEPTION 'Channels must be a JSON array';
  END IF;
  SELECT (e.plan_key <> 'free' OR e.lifetime_premium OR
          e.promo_premium_until > now()) INTO v_premium
  FROM public.squadview_entitlements e WHERE e.user_id = v_user;
  v_limit := CASE WHEN coalesce(v_premium, false) THEN 50 ELSE 16 END;
  v_count := jsonb_array_length(p_channels);
  IF v_count > v_limit THEN
    RAISE EXCEPTION 'Creator roster limit exceeded: % channels allowed', v_limit;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_channels) c(value)
    WHERE jsonb_typeof(c.value) <> 'string'
      OR length(c.value #>> '{}') NOT BETWEEN 1 AND 25
      OR (c.value #>> '{}') !~ '^[a-z0-9_]+$'
  ) THEN
    RAISE EXCEPTION 'Invalid Twitch login in channels';
  END IF;
  IF (SELECT count(DISTINCT c.value #>> '{}')
      FROM jsonb_array_elements(p_channels) c(value)) <> v_count THEN
    RAISE EXCEPTION 'Duplicate Twitch channels are not allowed';
  END IF;

  -- A chosen client UUID allows safe retry after network interruptions.
  INSERT INTO public.squadview_creator_squads
    (id, owner_user_id, slug, title, description)
  VALUES (p_squad_id, v_user, v_slug, v_title, v_description)
  ON CONFLICT (id) DO NOTHING;

  -- Lock the parent before any member writes (same lock as publish/member triggers).
  SELECT s.owner_user_id INTO v_owner
  FROM public.squadview_creator_squads s
  WHERE s.id = p_squad_id FOR UPDATE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Creator Squad not found' USING ERRCODE = '42501';
  END IF;
  IF (SELECT s.slug FROM public.squadview_creator_squads s WHERE s.id = p_squad_id) <> v_slug THEN
    RAISE EXCEPTION 'Public slug cannot change once created';
  END IF;

  UPDATE public.squadview_creator_squads
  SET title = v_title, description = v_description
  WHERE id = p_squad_id;

  -- Replacing the lineup within this one transaction prevents partial saves
  -- and avoids UNIQUE(squad_id,sort_order) violations during reordering.
  DELETE FROM public.squadview_creator_squad_members WHERE squad_id = p_squad_id;
  INSERT INTO public.squadview_creator_squad_members (squad_id, twitch_login, sort_order)
  SELECT p_squad_id, c.value #>> '{}', (c.ordinality - 1)::integer
  FROM jsonb_array_elements(p_channels) WITH ORDINALITY AS c(value, ordinality);

  RETURN p_squad_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.squadview_creator_publish(p_squad_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_requester uuid := (SELECT auth.uid());
  v_owner uuid;
  v_version integer;
  v_members jsonb;
  v_title text;
  v_description text;
  v_is_premium boolean := false;
  v_limit integer := 16;
BEGIN
  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- First lock the parent. All draft edits take this same parent lock.
  -- Then fetch the roster in a SEPARATE statement, with a fresh READ COMMITTED
  -- snapshot after any concurrent member edit has completed.
  SELECT s.owner_user_id INTO v_owner
  FROM public.squadview_creator_squads s
  WHERE s.id = p_squad_id
  FOR UPDATE;

  IF NOT FOUND OR v_owner IS DISTINCT FROM v_requester THEN
    RAISE EXCEPTION 'Creator Squad not found' USING ERRCODE = '42501';
  END IF;
  SELECT s.title, s.description INTO v_title, v_description
  FROM public.squadview_creator_squads s WHERE s.id = p_squad_id;
  SELECT jsonb_agg(
    jsonb_build_object('twitch_login', m.twitch_login)
    ORDER BY m.sort_order
  ) INTO v_members
  FROM public.squadview_creator_squad_members m
  WHERE m.squad_id = p_squad_id;
  SELECT (e.plan_key <> 'free' OR e.lifetime_premium OR e.promo_premium_until > now())
  INTO v_is_premium FROM public.squadview_entitlements e WHERE e.user_id = v_requester;
  v_limit := CASE WHEN coalesce(v_is_premium, false) THEN 50 ELSE 16 END;
  IF v_members IS NULL OR jsonb_array_length(v_members) NOT BETWEEN 1 AND v_limit THEN
    RAISE EXCEPTION 'Publishing requires between 1 and % featured Twitch channels', v_limit;
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.squadview_creator_squad_publications WHERE squad_id = p_squad_id;

  INSERT INTO public.squadview_creator_squad_publications
    (squad_id, version, title, description, members)
  VALUES (p_squad_id, v_version, v_title, v_description, v_members);

  UPDATE public.squadview_creator_squads
  SET is_published = true WHERE id = p_squad_id;
  RETURN v_version;
END;
$fn$;


COMMIT;
