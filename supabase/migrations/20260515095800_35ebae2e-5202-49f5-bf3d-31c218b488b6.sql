CREATE TABLE public.asset_report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_asset_report_items_building_year ON public.asset_report_items(building_id, fiscal_year);

ALTER TABLE public.asset_report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage asset report items"
ON public.asset_report_items FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (public.get_user_role(auth.uid()) = 'admin'::app_role);

CREATE TRIGGER trg_asset_report_items_updated_at
BEFORE UPDATE ON public.asset_report_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();