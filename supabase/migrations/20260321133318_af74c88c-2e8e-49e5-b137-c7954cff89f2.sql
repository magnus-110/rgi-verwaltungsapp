
CREATE OR REPLACE FUNCTION public.auto_match_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  matched_inv RECORD;
  matched_tmpl RECORD;
BEGIN
  BEGIN
    IF NEW.invoice_id IS NULL AND NEW.receipt_number IS NOT NULL AND btrim(NEW.receipt_number) != '' THEN
      SELECT id, vat_amount, vat_rate, gross_amount, net_amount
      INTO matched_inv
      FROM public.invoices
      WHERE invoice_number = NEW.receipt_number
        AND (building_id = NEW.building_id OR (building_id IS NULL AND NEW.building_id IS NULL))
      LIMIT 1;

      IF matched_inv.id IS NOT NULL THEN
        NEW.invoice_id := matched_inv.id;
        IF (NEW.vat_amount IS NULL OR NEW.vat_amount = 0) AND matched_inv.vat_amount IS NOT NULL THEN
          NEW.vat_amount := matched_inv.vat_amount;
        END IF;
        IF (NEW.vat_rate IS NULL OR NEW.vat_rate = 0) AND matched_inv.vat_rate IS NOT NULL THEN
          NEW.vat_rate := matched_inv.vat_rate;
        ELSIF (NEW.vat_rate IS NULL OR NEW.vat_rate = 0) AND matched_inv.net_amount IS NOT NULL AND matched_inv.net_amount > 0 THEN
          NEW.vat_rate := ROUND(((COALESCE(matched_inv.gross_amount, 0) - matched_inv.net_amount) / matched_inv.net_amount) * 100);
        END IF;
      END IF;
    END IF;

    IF NEW.invoice_id IS NULL AND NEW.matched_template_id IS NULL AND NEW.building_id IS NOT NULL THEN
      SELECT bt.id, bt.vat_rate AS tmpl_vat_rate
      INTO matched_tmpl
      FROM public.booking_templates bt
      WHERE bt.building_id = NEW.building_id
        AND (
          (bt.vendor_iban IS NOT NULL AND bt.vendor_iban != '' AND NEW.description IS NOT NULL AND NEW.description ILIKE '%' || bt.vendor_iban || '%')
          OR (bt.vendor_name IS NOT NULL AND bt.vendor_name != '' AND NEW.description IS NOT NULL AND NEW.description ILIKE '%' || bt.vendor_name || '%')
          OR (bt.expected_amount IS NOT NULL AND bt.expected_amount = ABS(NEW.amount))
        )
      LIMIT 1;

      IF matched_tmpl.id IS NOT NULL THEN
        NEW.matched_template_id := matched_tmpl.id;
        IF (NEW.vat_rate IS NULL OR NEW.vat_rate = 0) AND matched_tmpl.tmpl_vat_rate IS NOT NULL THEN
          NEW.vat_rate := matched_tmpl.tmpl_vat_rate;
          IF NEW.vat_rate > 0 AND (NEW.vat_amount IS NULL OR NEW.vat_amount = 0) THEN
            NEW.vat_amount := ROUND(ABS(NEW.amount) - (ABS(NEW.amount) / (1 + NEW.vat_rate / 100)), 2);
          END IF;
        END IF;
      END IF;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_match_booking error: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
