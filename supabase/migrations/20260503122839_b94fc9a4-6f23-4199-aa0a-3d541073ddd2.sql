-- Schritt B: Vertauschte Umbuchung 1040 ↔ 1400 korrigieren
-- Vorher: account_id=1040, counter=1400 (belastet 1040 fälschlich um +159,82)
-- Nachher: account_id=1400, counter=1040 (entlastet 1040 korrekt um -159,82)
UPDATE public.bookings
SET account_id = counter_account_id,
    counter_account_id = account_id
WHERE id = '5f926471-dcf7-4caa-b4a1-31f190d2f397';