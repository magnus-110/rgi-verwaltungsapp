-- vendor_aliases: short display names for vendors
CREATE TABLE public.vendor_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  raw_pattern TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX vendor_aliases_unique_global
  ON public.vendor_aliases (lower(raw_pattern))
  WHERE building_id IS NULL;

CREATE UNIQUE INDEX vendor_aliases_unique_building
  ON public.vendor_aliases (building_id, lower(raw_pattern))
  WHERE building_id IS NOT NULL;

CREATE INDEX vendor_aliases_pattern_idx ON public.vendor_aliases (lower(raw_pattern));

ALTER TABLE public.vendor_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vendor aliases"
  ON public.vendor_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert vendor aliases"
  ON public.vendor_aliases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update vendor aliases"
  ON public.vendor_aliases FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete vendor aliases"
  ON public.vendor_aliases FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_vendor_aliases_updated_at
  BEFORE UPDATE ON public.vendor_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cached display name on invoices (set at insert time only)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS vendor_display_name TEXT;