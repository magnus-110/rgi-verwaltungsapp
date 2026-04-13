
-- =============================================
-- BIRKENWEG 6: Buchungsdaten löschen, Rechnungen & Kontoauszüge behalten
-- =============================================

-- 1. Buchungen löschen
DELETE FROM bookings WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787';

-- 2. Buchungsvorlagen löschen
DELETE FROM booking_templates WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787';

-- 3. Transaktionen: Zuordnungen zurücksetzen (nicht löschen, da Kontoauszüge bleiben)
UPDATE bank_transactions 
SET match_status = 'unmatched', 
    matched_invoice_id = NULL, 
    matched_template_id = NULL, 
    booking_id = NULL, 
    booked_at = NULL
WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787';

-- 4. Kontosalden löschen
DELETE FROM account_balances WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787';

-- 5. Konto-Overrides löschen
DELETE FROM building_account_overrides WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787';

-- 6. Billing Validierungen löschen
DELETE FROM billing_validations WHERE billing_period_id IN (
  SELECT id FROM billing_periods WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787'
);

-- 7. Abrechnungszeiträume löschen
DELETE FROM billing_periods WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787';

-- =============================================
-- ACHWEG 3-5: Alles löschen außer Gebäude + Kontakte
-- =============================================

-- 1. Buchungen löschen
DELETE FROM bookings WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';

-- 2. Buchungsvorlagen löschen
DELETE FROM booking_templates WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';

-- 3. Transaktionen löschen
DELETE FROM bank_transactions WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';

-- 4. Kontoauszüge löschen
DELETE FROM bank_statements WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';

-- 5. Rechnungen löschen
DELETE FROM invoices WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';

-- 6. Kontosalden löschen
DELETE FROM account_balances WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';

-- 7. Konto-Overrides löschen
DELETE FROM building_account_overrides WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';

-- 8. Billing Validierungen löschen
DELETE FROM billing_validations WHERE billing_period_id IN (
  SELECT id FROM billing_periods WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9'
);

-- 9. Abrechnungszeiträume löschen
DELETE FROM billing_periods WHERE building_id = 'd549bcfd-a969-4feb-b442-3f0c13ae91f9';
