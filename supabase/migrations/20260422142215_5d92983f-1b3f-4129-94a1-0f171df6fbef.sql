-- Birkenweg 6 / 2025: Stale Overrides für 1010 (Müll) und 1011 (Papiertonne) entfernen
-- HV Office verteilt diese nach MEA (Tausendstel), nicht nach "einheiten".
DELETE FROM public.building_account_overrides
WHERE id IN (
  '0edc4b1d-c9e7-441c-9fa3-c6a13240734f', -- 1010 → einheiten (falsch)
  '4a65d5f7-2dd2-4571-b61c-ca8297aa3e77', -- 1011 → einheiten (falsch)
  'ec30c219-ff43-45ca-ba2d-15b200e4bbdd'  -- 1470 → heizkostenverordnung (Vorauszahlungskonto, kein Verteiler nötig)
);

-- Wirtschaftsplan 2025 für Birkenweg 6 anlegen, damit IHR-Zuführung 3.600 € verfügbar wird.
-- Die Engine nutzt economic_plans.total_reserve als "1720 Plan IHR Wohnungen".
INSERT INTO public.economic_plans (building_id, fiscal_year, status, total_costs, total_reserve)
VALUES (
  'f5fa943b-3fbc-459b-b2f0-f9e20443c787',
  2025,
  'approved',
  10500.12,  -- Vorschüsse zur Kostendeckung (HV Office)
  3600.00    -- Plan IHR Wohnungen (HV Office)
)
ON CONFLICT (building_id, fiscal_year) DO UPDATE
SET total_reserve = EXCLUDED.total_reserve,
    total_costs   = EXCLUDED.total_costs,
    status        = EXCLUDED.status;