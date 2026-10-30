-- SquadView Creator Studio Phase 5.0B.3H
-- Shared, database-backed protection for the PUBLIC live-status resolver.
-- Safe to stage locally. Apply only after separate review and approval.
-- No user identifiers or visitor IP addresses are stored.
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.squadview_public_creator_squad(text)') IS NULL THEN
    RAISE EXCEPTION 'Missing published-only Creator Squad baseline';
  END IF;
  IF to_regclass('public.squadview_creator_public_rate_windows') IS NOT NULL OR
     to_regprocedure('public.squadview_creator_public_rate_allow(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Shared rate limiter already exists; do not overwrite';
  END IF;
END;
$guard$;

CREATE TABLE public.squadview_creator_public_rate_windows (
  window_start timestamptz NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global', 'squad')),
  selector text NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (window_start, scope, selector)
);

ALTER TABLE public.squadview_creator_public_rate_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.squadview_creator_public_rate_windows
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.squadview_creator_public_rate_allow(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_bucket timestamptz := date_trunc('minute', clock_timestamp());
  v_count integer;
  v_global_first boolean := false;
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9_-]{2,39}$' THEN
    RETURN false;
  END IF;

  -- Serialize rate-limit decisions across concurrent function instances.
  -- Namespace is distinct from Creator draft/publish advisory locks.
  PERFORM pg_catalog.pg_advisory_xact_lock(621039, 88);

  -- Enforce the per-Squad limit first (240 requests per minute).
  INSERT INTO public.squadview_creator_public_rate_windows
    (window_start, scope, selector, request_count)
  VALUES (v_bucket, 'squad', p_slug, 1)
  ON CONFLICT (window_start, scope, selector)
  DO UPDATE SET request_count =
    public.squadview_creator_public_rate_windows.request_count + 1
  WHERE public.squadview_creator_public_rate_windows.request_count < 240
  RETURNING request_count INTO v_count;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Enforce the overall traffic limit (2,400 requests per minute).
  INSERT INTO public.squadview_creator_public_rate_windows
    (window_start, scope, selector, request_count)
  VALUES (v_bucket, 'global', 'all', 1)
  ON CONFLICT (window_start, scope, selector)
  DO UPDATE SET request_count =
    public.squadview_creator_public_rate_windows.request_count + 1
  WHERE public.squadview_creator_public_rate_windows.request_count < 2400
  RETURNING request_count INTO v_count;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  v_global_first := (v_count = 1);

  -- Bounded retention. Clean up once when a new global minute starts.
  IF v_global_first THEN
    DELETE FROM public.squadview_creator_public_rate_windows
    WHERE window_start < v_bucket - interval '5 minutes';
  END IF;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.squadview_creator_public_rate_allow(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.squadview_creator_public_rate_allow(text)
  TO service_role;

COMMIT;
