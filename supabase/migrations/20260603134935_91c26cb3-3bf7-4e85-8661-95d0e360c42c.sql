
CREATE TABLE public.rgi_item_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sparte text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_item_presets TO authenticated;
GRANT ALL ON public.rgi_item_presets TO service_role;

ALTER TABLE public.rgi_item_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage item presets"
ON public.rgi_item_presets FOR ALL TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE TRIGGER trg_rgi_item_presets_updated
BEFORE UPDATE ON public.rgi_item_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
