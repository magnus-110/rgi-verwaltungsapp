
CREATE TABLE public.building_share_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX building_share_types_building_value_uniq
  ON public.building_share_types (building_id, lower(value));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.building_share_types TO authenticated;
GRANT ALL ON public.building_share_types TO service_role;

ALTER TABLE public.building_share_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees can manage building share types"
  ON public.building_share_types
  FOR ALL
  USING (user_has_admin_access(auth.uid()))
  WITH CHECK (user_has_admin_access(auth.uid()));

CREATE POLICY "Authenticated can read building share types"
  ON public.building_share_types
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_building_share_types_updated_at
  BEFORE UPDATE ON public.building_share_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: every (building_id, share_type) currently used that isn't a known standard key
INSERT INTO public.building_share_types (building_id, value, label)
SELECT DISTINCT a.building_id, s.share_type, s.share_type
FROM public.contact_building_shares s
JOIN public.contact_building_assignments a ON a.id = s.assignment_id
WHERE s.share_type IS NOT NULL
  AND btrim(s.share_type) <> ''
  AND lower(s.share_type) NOT IN (
    'mea','whg.-mea','gar.-mea','sonder-mea','einheit','qm','personen',
    'garagen','stellplaetze','wasser','warmwasser','heizkosten',
    'verbrauch_wasser','heizkostenverordnung','direkt'
  )
ON CONFLICT DO NOTHING;
