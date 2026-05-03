-- Rollback Schritt B: Ursprüngliche Reihenfolge wiederherstellen
-- Korrekt für bank-zentrische Konvention bei interner Umbuchung:
--   account_id=1040 (verliert), counter=1400 (bekommt), expense
-- → Effekt 1040: -159.82 (Entlastung), Effekt 1400: +159.82 (Belastung)
UPDATE public.bookings
SET account_id = counter_account_id,
    counter_account_id = account_id
WHERE id = '5f926471-dcf7-4caa-b4a1-31f190d2f397';