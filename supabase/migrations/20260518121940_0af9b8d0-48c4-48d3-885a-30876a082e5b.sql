
CREATE TABLE public.etv_manual_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.etv_manual_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage manual notes"
ON public.etv_manual_notes
FOR ALL
TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE TRIGGER update_etv_manual_notes_updated_at
BEFORE UPDATE ON public.etv_manual_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_etv_manual_notes_building ON public.etv_manual_notes(building_id);
