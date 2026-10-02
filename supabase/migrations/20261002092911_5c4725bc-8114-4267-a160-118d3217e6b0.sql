CREATE TABLE public.etv_year_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  year integer NOT NULL,
  reason text NOT NULL DEFAULT 'extern',
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_year_exemptions TO authenticated;
GRANT ALL ON public.etv_year_exemptions TO service_role;
ALTER TABLE public.etv_year_exemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage etv year exemptions" ON public.etv_year_exemptions
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.etv_year_exemptions_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reason NOT IN ('extern','sonstiges') THEN
    RAISE EXCEPTION 'Ungültiger Grund: %', NEW.reason;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_etv_year_exemptions_validate
BEFORE INSERT OR UPDATE ON public.etv_year_exemptions
FOR EACH ROW EXECUTE FUNCTION public.etv_year_exemptions_validate();