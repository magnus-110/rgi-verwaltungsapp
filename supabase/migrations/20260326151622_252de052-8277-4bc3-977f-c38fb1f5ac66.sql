
-- Beschlusssammlung (Resolution Ledger)
CREATE TABLE public.etv_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.etv_meetings(id) ON DELETE CASCADE,
  agenda_item_id UUID NOT NULL REFERENCES public.etv_agenda_items(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  resolution_number TEXT,
  resolution_text TEXT NOT NULL,
  result TEXT NOT NULL,
  yes_count NUMERIC DEFAULT 0,
  no_count NUMERIC DEFAULT 0,
  abstain_count NUMERIC DEFAULT 0,
  voting_principle TEXT,
  resolved_at TIMESTAMPTZ DEFAULT now(),
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.etv_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage resolutions" ON public.etv_resolutions
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "WEG owners can view published resolutions" ON public.etv_resolutions
  FOR SELECT TO authenticated
  USING (
    published = true AND
    EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.building_id = etv_resolutions.building_id
        AND c.user_id = auth.uid()
    )
  );

-- Protocol text field on meetings
ALTER TABLE public.etv_meetings ADD COLUMN IF NOT EXISTS protocol_text TEXT;
ALTER TABLE public.etv_meetings ADD COLUMN IF NOT EXISTS protocol_generated_at TIMESTAMPTZ;
ALTER TABLE public.etv_meetings ADD COLUMN IF NOT EXISTS protocol_published BOOLEAN DEFAULT false;
