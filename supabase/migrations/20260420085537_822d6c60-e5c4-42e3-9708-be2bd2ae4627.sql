ALTER TABLE public.comm_campaigns
  ADD COLUMN IF NOT EXISTS body_format text NOT NULL DEFAULT 'html'
  CHECK (body_format IN ('html','plain'));

ALTER TABLE public.comm_templates
  ADD COLUMN IF NOT EXISTS body_format text NOT NULL DEFAULT 'html'
  CHECK (body_format IN ('html','plain'));