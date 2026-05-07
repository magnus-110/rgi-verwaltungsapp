ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS vapid_fingerprint text,
  ADD COLUMN IF NOT EXISTS last_delivery_status text,
  ADD COLUMN IF NOT EXISTS last_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_delivery_code integer;