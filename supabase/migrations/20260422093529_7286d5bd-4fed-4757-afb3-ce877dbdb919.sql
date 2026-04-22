-- Add nullable override for unit count (for "Verwalter nach Einheiten" when Teilungserklärung deviates)
ALTER TABLE public.buildings
ADD COLUMN IF NOT EXISTS unit_count_for_billing INTEGER;

COMMENT ON COLUMN public.buildings.unit_count_for_billing IS 'Override für Einheiten-Verteilung in Abrechnung (z. B. Verwaltervergütung). Wenn NULL → Fallback auf unit_count.';