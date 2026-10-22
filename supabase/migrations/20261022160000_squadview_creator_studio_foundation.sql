-- SquadView Phase 5.0A — CREATOR STUDIO FOUNDATION
-- SECURITY-REVISED REVIEW CANDIDATE. DO NOT RUN UNTIL EXPLICIT PRODUCTION APPROVAL.
-- Additive objects only; transaction rolls back on failure.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.squadview_profiles') IS NULL
     OR to_regclass('public.squadview_saved_squads') IS NULL
     OR to_regclass('public.squadview_twitch_connections') IS NULL THEN
    RAISE EXCEPTION 'Phase 5.0A baseline guard failed: existing SquadView account tables missing';
  END IF;
  IF to_regclass('public.squadview_creator_squads') IS NOT NULL
     OR to_regclass('public.squadview_creator_squad_members') IS NOT NULL
     OR to_regclass('public.squadview_creator_squad_publications') IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 5.0A collision guard: creator objects already exist. Inspect before proceeding.';
  END IF;
  IF to_regprocedure('public.squadview_creator_publish(uuid)') IS NOT NULL
     OR to_regprocedure('public.squadview_creator_unpublish(uuid)') IS NOT NULL
     OR to_regprocedure('public.squadview_public_creator_squad(text)') IS NOT NULL
     OR to_regprocedure('public.squadview_creator_squad_guard()') IS NOT NULL
     OR to_regprocedure('public.squadview_creator_member_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 5.0A collision guard: a creator function already exists.';
  END IF;
END;
$guard$;

CREATE TABLE public.squadview_creator_squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX squadview_creator_squads_owner_idx ON public.squadview_creator_squads(owner_user_id);

CREATE TABLE public.squadview_creator_squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squadview_creator_squads(id) ON DELETE CASCADE,
  twitch_login text NOT NULL CHECK (twitch_login ~ '^[a-z0-9_]{1,25}$'),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 15),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, twitch_login),
  UNIQUE (squad_id, sort_order)
);
CREATE INDEX squadview_creator_members_squad_idx ON public.squadview_creator_squad_members(squad_id, sort_order);

CREATE TABLE public.squadview_creator_squad_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squadview_creator_squads(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  description text NOT NULL,
  members jsonb NOT NULL CHECK (jsonb_typeof(members) = 'array'),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, version)
);
CREATE INDEX squadview_creator_pubs_latest_idx
  ON public.squadview_creator_squad_publications(squad_id, version DESC);

-- Enforce ownership and immutability of identity fields even for authenticated UPDATE.
CREATE FUNCTION public.squadview_creator_squad_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Creator Squad identity and stable public slug are immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.squadview_creator_squad_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER squadview_creator_squad_immutability
BEFORE UPDATE ON public.squadview_creator_squads
FOR EACH ROW EXECUTE FUNCTION public.squadview_creator_squad_guard();

-- Serialize draft-member writes with publish/unpublish by locking their parent.
-- Never allow a member to be reassigned to a different Squad.
CREATE FUNCTION public.squadview_creator_member_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE
  v_squad_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.squad_id IS DISTINCT FROM OLD.squad_id THEN
    RAISE EXCEPTION 'A member cannot be reassigned to another Creator Squad';
  END IF;
  v_squad_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.squad_id ELSE NEW.squad_id END;
  PERFORM 1 FROM public.squadview_creator_squads WHERE id = v_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator Squad not found';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.squadview_creator_member_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER squadview_creator_member_serialize
BEFORE INSERT OR UPDATE OR DELETE ON public.squadview_creator_squad_members
FOR EACH ROW EXECUTE FUNCTION public.squadview_creator_member_guard();

ALTER TABLE public.squadview_creator_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squadview_creator_squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squadview_creator_squad_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_squads_read_self ON public.squadview_creator_squads
 FOR SELECT TO authenticated USING (owner_user_id = (SELECT auth.uid()));
CREATE POLICY creator_squads_insert_self ON public.squadview_creator_squads
 FOR INSERT TO authenticated WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY creator_squads_update_self ON public.squadview_creator_squads
 FOR UPDATE TO authenticated USING (owner_user_id = (SELECT auth.uid()))
 WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY creator_squads_delete_self ON public.squadview_creator_squads
 FOR DELETE TO authenticated USING (owner_user_id = (SELECT auth.uid()));

CREATE POLICY creator_members_read_self ON public.squadview_creator_squad_members
 FOR SELECT TO authenticated USING (EXISTS (
   SELECT 1 FROM public.squadview_creator_squads s
   WHERE s.id = squad_id AND s.owner_user_id = (SELECT auth.uid())
 ));
CREATE POLICY creator_members_insert_self ON public.squadview_creator_squad_members
 FOR INSERT TO authenticated WITH CHECK (EXISTS (
   SELECT 1 FROM public.squadview_creator_squads s
   WHERE s.id = squad_id AND s.owner_user_id = (SELECT auth.uid())
 ));
CREATE POLICY creator_members_update_self ON public.squadview_creator_squad_members
 FOR UPDATE TO authenticated
 USING (EXISTS (SELECT 1 FROM public.squadview_creator_squads s WHERE s.id = squad_id AND s.owner_user_id = (SELECT auth.uid())))
 WITH CHECK (EXISTS (SELECT 1 FROM public.squadview_creator_squads s WHERE s.id = squad_id AND s.owner_user_id = (SELECT auth.uid())));
CREATE POLICY creator_members_delete_self ON public.squadview_creator_squad_members
 FOR DELETE TO authenticated USING (EXISTS (
   SELECT 1 FROM public.squadview_creator_squads s
   WHERE s.id = squad_id AND s.owner_user_id = (SELECT auth.uid())
 ));

-- Publications are immutable snapshots; only the publish RPC may insert them.
CREATE POLICY creator_publications_read_self ON public.squadview_creator_squad_publications
 FOR SELECT TO authenticated USING (EXISTS (
   SELECT 1 FROM public.squadview_creator_squads s
   WHERE s.id = squad_id AND s.owner_user_id = (SELECT auth.uid())
 ));

REVOKE ALL ON public.squadview_creator_squads,
  public.squadview_creator_squad_members,
  public.squadview_creator_squad_publications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.squadview_creator_squads TO authenticated;
-- is_published is controlled EXCLUSIVELY by publish/unpublish RPCs.
-- Identity and slug remain immutable; avoid granting UPDATE on those fields.
GRANT UPDATE (title, description) ON public.squadview_creator_squads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squadview_creator_squad_members TO authenticated;
GRANT SELECT ON public.squadview_creator_squad_publications TO authenticated;

-- Publish is atomic: lock parent, read latest committed draft, append a new version.
CREATE FUNCTION public.squadview_creator_publish(p_squad_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_requester uuid := (SELECT auth.uid());
  v_owner uuid;
  v_version integer;
  v_members jsonb;
  v_title text;
  v_description text;
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
  IF v_members IS NULL OR jsonb_array_length(v_members) NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'Publishing requires between 1 and 16 featured Twitch channels';
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

-- Unpublishing hides the public RPC immediately but retains all draft edits,
-- publication history and the permanent slug for future re-publishing.
CREATE FUNCTION public.squadview_creator_unpublish(p_squad_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_requester uuid := (SELECT auth.uid());
  v_owner uuid;
BEGIN
  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT owner_user_id INTO v_owner
  FROM public.squadview_creator_squads
  WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM v_requester THEN
    RAISE EXCEPTION 'Creator Squad not found' USING ERRCODE = '42501';
  END IF;
  UPDATE public.squadview_creator_squads
  SET is_published = false WHERE id = p_squad_id;
  RETURN true;
END;
$fn$;

-- Only sanitized, published data leaves this public RPC; drafts never leave.
CREATE FUNCTION public.squadview_public_creator_squad(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT jsonb_build_object(
    'slug', s.slug,
    'title', p.title,
    'description', p.description,
    'members', p.members,
    'version', p.version,
    'published_at', p.published_at
  )
  FROM public.squadview_creator_squads s
  JOIN LATERAL (
    SELECT title, description, members, version, published_at
    FROM public.squadview_creator_squad_publications
    WHERE squad_id = s.id ORDER BY version DESC LIMIT 1
  ) p ON true
  WHERE s.slug = p_slug AND s.is_published = true;
$fn$;

REVOKE ALL ON FUNCTION public.squadview_creator_publish(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.squadview_creator_unpublish(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.squadview_public_creator_squad(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.squadview_creator_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.squadview_creator_unpublish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.squadview_public_creator_squad(text) TO anon, authenticated;

COMMIT;
