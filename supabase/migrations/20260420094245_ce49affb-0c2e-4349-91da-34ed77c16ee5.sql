ALTER TABLE public.fuel_inventory
  ADD COLUMN IF NOT EXISTS co2_emissions_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS co2_tax_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS energy_content_kwh NUMERIC,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC;

COMMENT ON COLUMN public.fuel_inventory.co2_emissions_kg IS 'CO₂-Emissionen in kg (BEHG, nur bei fossilen Brennstoffen)';
COMMENT ON COLUMN public.fuel_inventory.co2_tax_amount IS 'CO₂-Preisanteil in EUR (BEHG)';
COMMENT ON COLUMN public.fuel_inventory.energy_content_kwh IS 'Brennwert/Energiegehalt der Lieferung in kWh';
COMMENT ON COLUMN public.fuel_inventory.net_amount IS 'Nettobetrag in EUR';
COMMENT ON COLUMN public.fuel_inventory.vat_amount IS 'MwSt in EUR';