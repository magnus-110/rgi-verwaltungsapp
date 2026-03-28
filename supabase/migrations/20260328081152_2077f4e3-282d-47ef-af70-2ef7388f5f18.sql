
-- Add meeting chair and minutes taker to etv_meetings
ALTER TABLE public.etv_meetings ADD COLUMN IF NOT EXISTS meeting_chair text;
ALTER TABLE public.etv_meetings ADD COLUMN IF NOT EXISTS minutes_taker text;

-- Add sqm voting method support + double qualified modifier to etv_agenda_items
ALTER TABLE public.etv_agenda_items ADD COLUMN IF NOT EXISTS requires_double_qualified boolean NOT NULL DEFAULT false;
ALTER TABLE public.etv_agenda_items ADD COLUMN IF NOT EXISTS double_qualified_relevant boolean NOT NULL DEFAULT false;

-- Create resolution templates table
CREATE TABLE IF NOT EXISTS public.etv_resolution_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  resolution_text text NOT NULL,
  category text DEFAULT 'sonstiges',
  voting_principle text DEFAULT 'mea',
  requires_double_qualified boolean NOT NULL DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.etv_resolution_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage resolution templates"
  ON public.etv_resolution_templates
  FOR ALL
  TO authenticated
  USING (user_has_admin_access(auth.uid()))
  WITH CHECK (user_has_admin_access(auth.uid()));
