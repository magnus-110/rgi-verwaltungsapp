-- A) Müll: §35a entfernen
UPDATE public.chart_of_accounts
SET is_35a_relevant = false, settlement_35a_type = NULL
WHERE account_number IN ('1010');

-- B) Vermieter-/Leerstandskonten: nicht-umlagefähig
UPDATE public.chart_of_accounts
SET settlement_section = 'operating_non_distributable'
WHERE account_number IN ('1031','1051','1461');

-- C) Heizungs-Wartung: §35a entfernen, wo unzulässig
UPDATE public.chart_of_accounts
SET is_35a_relevant = false, settlement_35a_type = NULL
WHERE account_number IN ('1431');

UPDATE public.chart_of_accounts
SET is_35a_relevant = false
WHERE account_number IN ('1430');

-- D) Instandhaltung 1600–1610: umlagefähig
UPDATE public.chart_of_accounts
SET settlement_section = 'operating_distributable',
    is_distributable = true,
    is_billing_relevant = true
WHERE account_number IN ('1600','1601','1602','1603','1610');

-- E) Zinsen auf Rücklage
UPDATE public.chart_of_accounts
SET settlement_section = 'reserve',
    is_distributable = false
WHERE account_number = '1840';

-- F) Memo-/Reportingkonten raus
UPDATE public.chart_of_accounts
SET settlement_section = NULL,
    is_distributable = false,
    is_billing_relevant = false,
    default_vat_rate = 0
WHERE account_number IN ('1900','1910','1930');

UPDATE public.chart_of_accounts
SET settlement_section = NULL
WHERE account_number IN ('7100','7120');

-- G) 1920 Reparaturen aus Rücklage: Neutralisierung sichern
UPDATE public.chart_of_accounts
SET settlement_section = 'operating_distributable',
    is_distributable = true,
    default_vat_rate = 0
WHERE account_number = '1920';

-- H) Aggregat-/System-Konten: keine MwSt, keine Sektion
UPDATE public.chart_of_accounts
SET settlement_section = NULL,
    is_distributable = false,
    default_vat_rate = 0
WHERE account_number IN ('1700','1730','1740','1770','1780');

UPDATE public.chart_of_accounts
SET default_vat_rate = 0
WHERE account_number IN ('00000','09999.998','09999.999');

-- I) Verrechnungs-/Abgrenzungskonten: MwSt 0 %
UPDATE public.chart_of_accounts
SET default_vat_rate = 0
WHERE account_number IN (
  '4000','4010','4020','4021','4025','4030','4040',
  '4100','4110','4120','4130','4140','4150','4160','4170','4180',
  '4900','4910','9000'
);

-- J) Birkenweg 6: falscher Override 1010 → heizkostenverordnung löschen
DELETE FROM public.building_account_overrides
WHERE distribution_key = 'heizkostenverordnung'
  AND account_id IN (SELECT id FROM public.chart_of_accounts WHERE account_number = '1010');