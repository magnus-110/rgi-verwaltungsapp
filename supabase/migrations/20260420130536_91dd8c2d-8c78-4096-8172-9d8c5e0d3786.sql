-- Cleanup: alle Buchungen 2025 für Birkenweg 6 löschen
-- Rechnungen, Vorlagen, Kontoauszüge und Bankbewegungen bleiben erhalten

DO $$
DECLARE
  v_building uuid := 'f5fa943b-3fbc-459b-b2f0-f9e20443c787';
BEGIN
  -- 1) Bankbewegungen entkoppeln und auf "offen" zurücksetzen
  UPDATE bank_transactions
  SET booking_id = NULL,
      match_status = 'unmatched',
      booked_at = NULL
  WHERE building_id = v_building
    AND booking_id IN (
      SELECT id FROM bookings
      WHERE building_id = v_building AND fiscal_year = 2025
    );

  -- 2) Verknüpfte Rechnungen auf "open" zurücksetzen, damit sie wieder verbucht werden können
  UPDATE invoices
  SET status = 'open'
  WHERE id IN (
    SELECT DISTINCT invoice_id FROM bookings
    WHERE building_id = v_building
      AND fiscal_year = 2025
      AND invoice_id IS NOT NULL
  );

  -- 3) Buchungen löschen
  DELETE FROM bookings
  WHERE building_id = v_building
    AND fiscal_year = 2025;
END $$;