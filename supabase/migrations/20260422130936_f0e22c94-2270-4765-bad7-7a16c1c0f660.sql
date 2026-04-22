-- ============================================================
-- 1) Globaler Kontenrahmen — Praxis-konforme WEG-Defaults
-- ============================================================

-- Müllkonten: nach MEA verteilen (Personen-Schlüssel funktioniert nur bei
-- gepflegten Personenständen pro Eigentümer; MEA ist der robuste Default)
UPDATE chart_of_accounts
SET default_distribution_key = 'mea'
WHERE building_id IS NULL
  AND account_number IN ('1010','1011','1012','1013');

-- Gerätemiete & Heizungswartung: WEG-Gemeinkosten -> MEA, nicht heizungsrelevant
UPDATE chart_of_accounts
SET default_distribution_key = 'mea',
    is_heating_relevant = false
WHERE building_id IS NULL
  AND account_number IN ('1431','1440');

-- Verwaltervergütung: keine Handwerkerleistung
UPDATE chart_of_accounts
SET is_35a_relevant = false,
    settlement_35a_type = NULL
WHERE building_id IS NULL
  AND account_number = '1500';

-- Kapitalertragsteuer & Soli: gehören in die Rücklagenentwicklung,
-- nicht in die laufende Abrechnung
UPDATE chart_of_accounts
SET is_billing_relevant = false
WHERE building_id IS NULL
  AND account_number IN ('1850','1860');

-- Vorauszahlungen Strom/Wasser: fehlenden Verteilerschlüssel ergänzen
UPDATE chart_of_accounts
SET default_distribution_key = 'mea'
WHERE building_id IS NULL
  AND account_number IN ('1472','1473')
  AND default_distribution_key IS NULL;

-- Vermieteranteile (SEV) gehören nicht in die WEG-Verteilung
UPDATE chart_of_accounts
SET is_distributable = false
WHERE building_id IS NULL
  AND account_number IN ('1031','1051');

-- ============================================================
-- 2) Birkenweg 6 — Personenkonten 0001/0002/0003 bereinigen
--    Personenkonten sind Debitoren, NICHT verteilbare WEG-Einnahmen.
-- ============================================================
UPDATE chart_of_accounts
SET is_distributable = false,
    settlement_section = NULL,
    default_distribution_key = NULL
WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787'
  AND account_number IN ('0001','0002','0003');