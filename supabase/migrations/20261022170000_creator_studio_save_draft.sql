-- Phase 5.0B.2. Additive, reviewed before any remote installation.
-- Atomically create/update creator metadata and replace the ordered draft roster.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.squadview_creator_squads') IS NULL
    OR to_regclass('public.squadview_creator_squad_members') IS NULL THEN
    RAISE EXCEPTION 'Creator Studio 5.0A foundation missing';
  END IF;
  IF to_regprocedure('public.squadview_creator_save_draft(uuid,text,text,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Creator Studio draft RPC already exists';
  END IF;
END;
$guard$;

CREATE FUNCTION public.squadview_creator_save_draft(
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
  v_count := jsonb_array_length(p_channels);
  IF v_count > 16 THEN
    RAISE EXCEPTION 'A draft supports at most 16 Twitch channels';
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
REVOKE ALL ON FUNCTION public.squadview_creator_save_draft(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.squadview_creator_save_draft(uuid,text,text,text,jsonb) TO authenticated;
COMMIT;
