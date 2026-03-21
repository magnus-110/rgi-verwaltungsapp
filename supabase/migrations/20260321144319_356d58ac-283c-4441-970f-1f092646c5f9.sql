-- Fix auto matching for Make.com bookings and backfill recent unmapped rows
CREATE OR REPLACE FUNCTION public.auto_match_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  matched_inv RECORD;
  matched_tmpl RECORD;
  normalized_receipt TEXT;
BEGIN
  BEGIN
    normalized_receipt := NULLIF(
      regexp_replace(upper(coalesce(NEW.receipt_number, '')), '[^A-Z0-9]', '', 'g'),
      ''
    );

    -- 1) Try invoice match via normalized receipt_number <-> invoice_number
    IF NEW.invoice_id IS NULL AND normalized_receipt IS NOT NULL THEN
      SELECT i.id, i.vat_amount, i.gross_amount, i.net_amount
      INTO matched_inv
      FROM public.invoices i
      WHERE NULLIF(regexp_replace(upper(coalesce(i.invoice_number, '')), '[^A-Z0-9]', '', 'g'), '') = normalized_receipt
        AND (
          (NEW.building_id IS NOT NULL AND (i.building_id = NEW.building_id OR i.building_id IS NULL))
          OR (NEW.building_id IS NULL)
        )
      ORDER BY
        CASE
          WHEN NEW.building_id IS NOT NULL AND i.building_id = NEW.building_id THEN 0
          WHEN i.building_id IS NULL THEN 1
          ELSE 2
        END,
        i.created_at DESC
      LIMIT 1;

      IF matched_inv.id IS NOT NULL THEN
        NEW.invoice_id := matched_inv.id;

        IF (NEW.vat_amount IS NULL OR NEW.vat_amount = 0) THEN
          NEW.vat_amount := COALESCE(
            matched_inv.vat_amount,
            CASE
              WHEN matched_inv.gross_amount IS NOT NULL AND matched_inv.net_amount IS NOT NULL
              THEN ROUND((matched_inv.gross_amount - matched_inv.net_amount)::numeric, 2)
              ELSE NULL
            END,
            NEW.vat_amount
          );
        END IF;

        IF (NEW.vat_rate IS NULL OR NEW.vat_rate = 0) THEN
          NEW.vat_rate := COALESCE(
            CASE
              WHEN matched_inv.net_amount IS NOT NULL
                   AND matched_inv.net_amount <> 0
                   AND matched_inv.gross_amount IS NOT NULL
              THEN ROUND((((matched_inv.gross_amount - matched_inv.net_amount) / matched_inv.net_amount) * 100)::numeric, 2)
              ELSE NULL
            END,
            NEW.vat_rate
          );
        END IF;
      END IF;
    END IF;

    -- 2) Try template match if no invoice matched yet
    IF NEW.invoice_id IS NULL AND NEW.matched_template_id IS NULL AND NEW.building_id IS NOT NULL THEN
      SELECT bt.id, bt.vat_rate AS tmpl_vat_rate, bt.is_35a_relevant
      INTO matched_tmpl
      FROM public.booking_templates bt
      WHERE bt.building_id = NEW.building_id
        AND (
          (bt.vendor_iban IS NOT NULL AND bt.vendor_iban <> '' AND NEW.description IS NOT NULL AND NEW.description ILIKE '%' || bt.vendor_iban || '%')
          OR (bt.vendor_name IS NOT NULL AND bt.vendor_name <> '' AND NEW.description IS NOT NULL AND NEW.description ILIKE '%' || bt.vendor_name || '%')
          OR (bt.expected_amount IS NOT NULL AND abs(bt.expected_amount - abs(NEW.amount)) <= 0.01)
        )
      ORDER BY
        CASE WHEN bt.expected_amount IS NOT NULL AND abs(bt.expected_amount - abs(NEW.amount)) <= 0.01 THEN 0 ELSE 1 END,
        bt.updated_at DESC
      LIMIT 1;

      IF matched_tmpl.id IS NOT NULL THEN
        NEW.matched_template_id := matched_tmpl.id;

        IF (NEW.vat_rate IS NULL OR NEW.vat_rate = 0) AND matched_tmpl.tmpl_vat_rate IS NOT NULL THEN
          NEW.vat_rate := matched_tmpl.tmpl_vat_rate;
        END IF;

        IF (NEW.vat_amount IS NULL OR NEW.vat_amount = 0) AND COALESCE(NEW.vat_rate, 0) > 0 THEN
          NEW.vat_amount := ROUND((abs(NEW.amount) - (abs(NEW.amount) / (1 + (NEW.vat_rate / 100))))::numeric, 2);
        END IF;

        IF COALESCE(NEW.is_35a_relevant, false) = false AND COALESCE(matched_tmpl.is_35a_relevant, false) = true THEN
          NEW.is_35a_relevant := true;
        END IF;
      END IF;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_match_booking error: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Ensure trigger is present for both inserts and relevant updates
DROP TRIGGER IF EXISTS trg_auto_match_booking ON public.bookings;
CREATE TRIGGER trg_auto_match_booking
BEFORE INSERT OR UPDATE OF receipt_number, description, amount, building_id, invoice_id, matched_template_id, vat_rate, vat_amount
ON public.bookings
FOR EACH ROW
WHEN (
  NEW.invoice_id IS NULL
  OR NEW.matched_template_id IS NULL
  OR COALESCE(NEW.vat_rate, 0) = 0
  OR NEW.vat_amount IS NULL
)
EXECUTE FUNCTION public.auto_match_booking();

-- Backfill recently imported KI/Make bookings by re-triggering update logic
UPDATE public.bookings
SET updated_at = now()
WHERE source = 'KI'
  AND created_at > now() - interval '14 days'
  AND (
    invoice_id IS NULL
    OR matched_template_id IS NULL
    OR COALESCE(vat_rate, 0) = 0
    OR vat_amount IS NULL
  );