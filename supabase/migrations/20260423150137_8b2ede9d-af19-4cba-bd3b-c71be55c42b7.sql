-- 1) Reserve role für Konten (Rücklagen-Doppeldarstellung)
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS reserve_role TEXT
  CHECK (reserve_role IN ('withdrawal', 'contribution'));

-- Standard-Markierungen: 1920 = Entnahme, 1720 = Zuführung
UPDATE public.chart_of_accounts
SET reserve_role = 'withdrawal'
WHERE account_number LIKE '1920%' AND reserve_role IS NULL;

UPDATE public.chart_of_accounts
SET reserve_role = 'contribution'
WHERE account_number LIKE '1720%' AND reserve_role IS NULL;

-- 2) EHR-Anteil pro Hausgeld-Kostenposition
ALTER TABLE public.contact_building_costs
  ADD COLUMN IF NOT EXISTS reserve_share_monthly NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.contact_building_costs.reserve_share_monthly IS
  'Anteil des Hausgeldbetrags, der auf die Erhaltungsrücklage entfällt (€/Monat). 0 = keine Aufteilung in der Abrechnung.';

COMMENT ON COLUMN public.chart_of_accounts.reserve_role IS
  'Rolle dieses Kontos im Rücklagenblock der Einzelabrechnung: withdrawal (Entnahme, doppelt: Aufwand − und Rücklage +), contribution (Zuführung, nur Rücklage −), NULL (kein Rücklagenkonto).';
