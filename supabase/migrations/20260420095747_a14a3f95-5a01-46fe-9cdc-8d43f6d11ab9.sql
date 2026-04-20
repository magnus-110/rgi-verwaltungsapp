
-- 1. Tabelle heating_units
CREATE TABLE public.heating_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fuel_type TEXT NOT NULL DEFAULT 'oil',
  tank_capacity NUMERIC,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_heating_units_building ON public.heating_units(building_id);

ALTER TABLE public.heating_units ENABLE ROW LEVEL SECURITY;

-- RLS: alle authentifizierten Nutzer (analog fuel_inventory)
CREATE POLICY "Auth users can view heating_units"
  ON public.heating_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert heating_units"
  ON public.heating_units FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update heating_units"
  ON public.heating_units FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth users can delete heating_units"
  ON public.heating_units FOR DELETE TO authenticated USING (true);

-- updated_at Trigger
CREATE TRIGGER trg_heating_units_updated_at
  BEFORE UPDATE ON public.heating_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. fuel_inventory um heating_unit_id erweitern (nullable für Rückwärtskompatibilität)
ALTER TABLE public.fuel_inventory
  ADD COLUMN heating_unit_id UUID REFERENCES public.heating_units(id) ON DELETE SET NULL;

CREATE INDEX idx_fuel_inventory_heating_unit ON public.fuel_inventory(heating_unit_id);

-- 3. Auto-Migration: Für jede Liegenschaft mit Brennstoffdaten einen Default-Heizkreis pro fuel_type anlegen
DO $$
DECLARE
  rec RECORD;
  new_unit_id UUID;
BEGIN
  FOR rec IN
    SELECT DISTINCT building_id, fuel_type
    FROM public.fuel_inventory
    WHERE building_id IS NOT NULL AND heating_unit_id IS NULL
  LOOP
    INSERT INTO public.heating_units (building_id, name, fuel_type, notes)
    VALUES (rec.building_id, 'Hauptanlage', rec.fuel_type, 'Automatisch angelegt für Bestandsdaten')
    RETURNING id INTO new_unit_id;

    UPDATE public.fuel_inventory
       SET heating_unit_id = new_unit_id
     WHERE building_id = rec.building_id
       AND fuel_type = rec.fuel_type
       AND heating_unit_id IS NULL;
  END LOOP;
END $$;
