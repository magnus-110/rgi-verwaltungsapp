ALTER TABLE public.comm_templates ADD COLUMN IF NOT EXISTS template_kind text NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS idx_comm_templates_kind ON public.comm_templates(template_kind);