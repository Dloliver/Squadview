ALTER TABLE public.squadview_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at timestamptz;
