UPDATE public.bank_transactions SET
  creditor_name = 'Markus Reithemann',
  creditor_iban = 'DE88720900000008475318',
  purpose = '250167, 02/25 SecureGo plus IBAN: DE88720900000008475318 BIC: GENODEF1AUB',
  matched_invoice_id = NULL,
  match_status = 'unmatched'
WHERE id = '510077a5-6c21-4b9a-b46c-9e1e710b19ca';

UPDATE public.bank_transactions SET
  amount = -43,
  creditor_name = 'Elektrizitätswerke Reutte GmbH & Co. KG',
  creditor_iban = 'DE31733500000000009811',
  debtor_name = NULL,
  debtor_iban = NULL
WHERE id = '41535e0a-5c80-4ed6-af53-75e77eb7cef9';

UPDATE public.bookings
SET bank_transaction_id = '38d77767-122b-40ea-82e8-21d0da37fc7e'
WHERE bank_transaction_id = '5d458088-0b75-4d5f-a834-f35de11a211b';

DELETE FROM public.bank_transactions WHERE id = '5d458088-0b75-4d5f-a834-f35de11a211b';

INSERT INTO public.bank_transactions (
  statement_id, building_id, booking_date, amount, currency,
  creditor_name, creditor_iban, purpose, match_status, transaction_hash
) VALUES (
  '40b17193-4fef-4ac5-8729-9fd50b80bfd8',
  'f7267c4e-05b6-4a7e-a727-1f434c73c680',
  '2025-02-17', -112.95, 'EUR',
  'Landkreis Ostallgaeu', 'DE48733500000610595696',
  'Abfallgebuehr 1.Quartal 2025 EREF: KD146417002 RG146417002501 30365 MREF: 14641700201 CRED: DE37ABF00000012592 IBAN: DE48733500000610595696 BIC: BYLADEM1ALG',
  'unmatched',
  encode(sha256('2025-02-17|-112.95|DE48733500000610595696|Landkreis-fix-510077a5'::bytea), 'hex')
);

UPDATE public.bank_statements SET
  parse_warnings = jsonb_build_array(
    'Manuell korrigiert am 04.05.2026: 13.02. -114,24 € war fälschlich Landkreis Ostallgäu zugeordnet (korrekt: Markus Reithemann). 17.02. Landkreis-Buchung -112,95 € fehlte komplett (jetzt ergänzt). EWR-Vorzeichen 05.02. korrigiert. Doppel-Reithemann-Buchung 10.02. entfernt; Buchung auf echte techem-Zeile umgehängt.'
  )
WHERE id = '40b17193-4fef-4ac5-8729-9fd50b80bfd8';