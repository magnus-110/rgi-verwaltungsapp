
-- Korrekturen Birkenweg 6 / WJ 2025 lt. HV-Office-Abgleich

-- 1) Anfangsbestand 1800 korrigieren: 3.510,00 -> 3.510,81 (Tippfehler)
UPDATE public.bookings
SET amount = 3510.81,
    description = 'Anfangsbestand 01.01.25 (korrigiert von 3.510,00 auf 3.510,81)'
WHERE id = '3160c707-811f-4b05-9696-a3630dce21ba';

-- 2) Bestehende HK-Umbuchung 279,19 € (1472 -> 1400) löschen
DELETE FROM public.bookings
WHERE building_id = 'f5fa943b-3fbc-459b-b2f0-f9e20443c787'
  AND fiscal_year = 2025
  AND description ILIKE 'HK-Umbuchung: Vorauszahlungen Strom%';

-- 2a) Splitt: 111,68 € Allgemeinstrom (1472 -> 1050) lt. HV Office
INSERT INTO public.bookings
  (building_id, fiscal_year, booking_date, amount, account_id, counter_account_id,
   description, source, status, booking_type)
VALUES (
  'f5fa943b-3fbc-459b-b2f0-f9e20443c787', 2025, '2025-12-31', 111.68,
  '9c48d3fd-013e-4c2e-8a2d-e5b0d9cc7b3a',
  '62f1a4d2-f561-4356-a217-cfa498e9956f',
  'HK-Umbuchung Strom: Allgemeinstromanteil 111,68 € (lt. HV Office, vorerst manuell - zukünftig flexibel über Brunata)',
  'manual', 'confirmed', 'manual'
);

-- 2b) Splitt: 167,51 € Heizungsstrom (1472 -> 1400)
INSERT INTO public.bookings
  (building_id, fiscal_year, booking_date, amount, account_id, counter_account_id,
   description, source, status, booking_type)
VALUES (
  'f5fa943b-3fbc-459b-b2f0-f9e20443c787', 2025, '2025-12-31', 167.51,
  '9c48d3fd-013e-4c2e-8a2d-e5b0d9cc7b3a',
  'cf2b62d5-b1a4-4598-a2d3-40c5e179ef84',
  'HK-Umbuchung Strom: Heizungsstromanteil 167,51 € (lt. HV Office, vorerst manuell - zukünftig flexibel über Brunata)',
  'manual', 'confirmed', 'manual'
);

-- 3) Manuelle Buchung 4020 WEG-Abrech.-Sollstellung Vorjahr: -1.239,19 €
INSERT INTO public.bookings
  (building_id, fiscal_year, booking_date, amount, account_id, counter_account_id,
   description, source, status, booking_type)
VALUES (
  'f5fa943b-3fbc-459b-b2f0-f9e20443c787', 2025, '2025-01-01', 1239.19,
  '54f9f5b8-1011-49f3-a945-e05ce1541760',
  'bdeeb874-29a2-4558-aa30-07c2a70144a4',
  'WEG-Abrech.-Sollstellung aus Vorjahresabrechnung 2024 (manuell nachgetragen lt. HV Office, -1.239,19 €)',
  'manual', 'confirmed', 'manual'
);

-- 4) Korrekturbuchung 4160 Abgrenzung: Saldo-Anpassung auf +733,87 €
-- Aktueller DB-Saldo 4160 = -648,00 €. Diff zu Soll +733,87 € = +1.381,87 €
INSERT INTO public.bookings
  (building_id, fiscal_year, booking_date, amount, account_id, counter_account_id,
   description, source, status, booking_type)
VALUES (
  'f5fa943b-3fbc-459b-b2f0-f9e20443c787', 2025, '2025-12-31', 1381.87,
  'baeb32ac-fca9-44c6-8baa-6ffe591fd2bb',
  'bdeeb874-29a2-4558-aa30-07c2a70144a4',
  'Korrektur 4160 Abgrenzung: Saldo-Anpassung +1.381,87 € auf Sollwert 733,87 € lt. HV Office (Beleg fehlt noch, bitte nachreichen)',
  'manual', 'confirmed', 'manual'
);
