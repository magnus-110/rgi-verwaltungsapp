-- Markiert echte Erhaltungsrücklagen-Zuführungskonten (z. B. 1930 "Planmäßige IHR Wohnungen")
-- mit settlement_section='reserve', damit der Wirtschaftsplan-Editor sie korrekt
-- als EHR-Anteil ausweist (nicht mehr als Vorschuss zur Kostendeckung).
--
-- Bewusst eng gezogen: nur Konten mit eindeutigem Namen ODER bereits gesetztem
-- is_reserve_funded-Flag, damit Sammelkonten wie 1700 "Summe Bewirtschaftungskosten"
-- oder 1740 "Einnahmen der WEG" (deren category zufällig "Rücklagen" enthält)
-- NICHT fälschlich umgestellt werden.
UPDATE public.chart_of_accounts
SET settlement_section = 'reserve'
WHERE settlement_section IS NULL
  AND (reserve_role IS DISTINCT FROM 'withdrawal')
  AND (
    is_reserve_funded = true
    OR account_name ~* '(planmäßige|zuführung).*(rücklage|ihr|erhaltung)'
    OR account_name ~* 'erhaltungsrücklage'
    OR (account_number ~ '^193' AND account_name ~* 'ihr|rücklage|erhaltung')
  );