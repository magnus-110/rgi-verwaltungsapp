-- Fix: auto_match_booking darf beim gezielten Entfernen einer Zuordnung
-- (UPDATE: invoice_id/matched_template_id vorher gesetzt, jetzt NULL) NICHT
-- automatisch neu zuordnen. Sonst laesst sich eine Rechnungs-/Vorlagen-
-- Zuordnung nie entfernen, weil der Auto-Matcher sie sofort wieder setzt.
CREATE OR REPLACE FUNCTION public.auto_match_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_inv RECORD;
  matched_tmpl RECORD;
  normalized_receipt TEXT;
  inv_found BOOLEAN := FALSE;
  tmpl_found BOOLEAN := FALSE;
  skip_invoice_match BOOLEAN := FALSE;
  skip_template_match BOOLEAN := FALSE;
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS NULL THEN
        skip_invoice_match := TRUE;
      END IF;
      IF OLD.matched_template_id IS NOT NULL AND NEW.matched_template_id IS NULL THEN
        skip_template_match := TRUE;
      END IF;
    END IF;

    normalized_receipt := NULLIF(
      regexp_replace(upper(coalesce(NEW.receipt_number, '')), '[^A-Z0-9]', '', 'g'),
      ''
    );

    IF NEW.invoice_id IS NULL AND NOT skip_invoice_match AND normalized_receipt IS NOT NULL THEN
      SELECT i.id, i.vat_amount, i.gross_amount, i.net_amount
      INTO matched_inv
      FROM public.invoices i
      WHERE NULLIF(regexp_replace(upper(coalesce(i.invoice_number, '')), '[^A-Z0-9]', '', 'g'), '') = normalized_receipt
        AND COALESCE(i.is_company_invoice, false) = false
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
      inv_found := FOUND;
    END IF;

    IF NEW.invoice_id IS NULL AND NOT skip_invoice_match AND NOT inv_found AND NEW.description IS NOT NULL THEN
      SELECT i.id, i.vat_amount, i.gross_amount, i.net_amount
      INTO matched_inv
      FROM public.invoices i
      WHERE i.vendor_name IS NOT NULL
        AND i.vendor_name <> ''
        AND NEW.description ILIKE '%' || i.vendor_name || '%'
        AND i.gross_amount IS NOT NULL
        AND abs(i.gross_amount - abs(NEW.amount)) <= 0.01
        AND COALESCE(i.is_company_invoice, false) = false
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
      inv_found := FOUND;
    END IF;

    IF NEW.invoice_id IS NULL AND inv_found THEN
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

    IF NEW.invoice_id IS NULL AND NOT skip_template_match AND NEW.matched_template_id IS NULL AND NEW.building_id IS NOT NULL THEN
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
      tmpl_found := FOUND;

      IF tmpl_found THEN
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
$function$;
