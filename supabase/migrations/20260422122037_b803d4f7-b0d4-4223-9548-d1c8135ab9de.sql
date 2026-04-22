-- 1) Eröffnungsbuchung Konto 1800 (Birkenweg 6, 01.01.2025) umkehren
-- bank-zentrische Konvention: account_id=Bank, counter_account_id=4000
UPDATE bookings
SET account_id = 'bdeeb874-29a2-4558-aa30-07c2a70144a4',         -- 1800 Bank
    counter_account_id = '09878497-20ee-4d23-a58a-e5d47df5ffe7'  -- 4000 Eröffnung
WHERE id = '3160c707-811f-4b05-9696-a3630dce21ba';

-- 2) Konten 1850/1860 sind Kapitalertragsteuer/Soli auf Rücklagenzinsen — keine Eigentümer-Kosten
UPDATE chart_of_accounts SET is_distributable = false WHERE account_number IN ('1850','1860') AND building_id IS NULL;