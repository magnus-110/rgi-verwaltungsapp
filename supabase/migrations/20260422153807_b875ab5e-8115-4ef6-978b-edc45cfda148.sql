INSERT INTO public.bookings (
  building_id, account_id, counter_account_id, booking_date, amount,
  description, fiscal_year, source, status, booking_type,
  receipt_number, booking_reference, vat_rate, vat_amount, is_35a_relevant
) VALUES (
  'f5fa943b-3fbc-459b-b2f0-f9e20443c787',
  'cf2b62d5-b1a4-4598-a2d3-40c5e179ef84',
  'bdeeb874-29a2-4558-aa30-07c2a70144a4',
  '2025-12-31',
  808.42,
  'Brunata Servicekosten 2025 (Ausgleichsbuchung): Verbrauchsabrechnung 515,67 € + Gerätemiete 243,24 € + Schätzung 5,30 € + Rest 44,21 €. Beleg folgt nach.',
  2025,
  'manual',
  'pending',
  'expense',
  NULL,
  '12/25',
  0,
  0,
  false
);