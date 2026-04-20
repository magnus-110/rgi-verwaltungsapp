ALTER TABLE public.fuel_inventory
  ADD COLUMN IF NOT EXISTS consumption_period_from DATE,
  ADD COLUMN IF NOT EXISTS consumption_period_to DATE,
  ADD COLUMN IF NOT EXISTS consumption_year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM consumption_period_to)::INTEGER) STORED;

UPDATE public.fuel_inventory
SET consumption_period_from = COALESCE(consumption_period_from, entry_date),
    consumption_period_to   = COALESCE(consumption_period_to, entry_date)
WHERE consumption_period_to IS NULL OR consumption_period_from IS NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_inventory_building_consumption_year
  ON public.fuel_inventory (building_id, consumption_year);