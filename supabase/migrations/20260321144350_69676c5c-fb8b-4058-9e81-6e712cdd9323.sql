-- Re-run matching trigger for recent KI/Make bookings by touching trigger columns
UPDATE public.bookings
SET receipt_number = receipt_number,
    description = description
WHERE source = 'KI'
  AND created_at > now() - interval '14 days'
  AND (
    invoice_id IS NULL
    OR matched_template_id IS NULL
    OR COALESCE(vat_rate, 0) = 0
    OR vat_amount IS NULL
  );