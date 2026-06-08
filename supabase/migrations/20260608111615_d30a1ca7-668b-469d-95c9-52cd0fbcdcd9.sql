CREATE OR REPLACE FUNCTION public.rgi_compute_invoice_item_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.line_net := round((COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price_net, 0))::numeric, 2);
  NEW.line_vat := round((NEW.line_net * COALESCE(NEW.vat_rate, 0) / 100)::numeric, 2);
  NEW.line_gross := round((NEW.line_net + NEW.line_vat)::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rgi_invoice_items_compute_lines ON public.rgi_invoice_items;
CREATE TRIGGER trg_rgi_invoice_items_compute_lines
BEFORE INSERT OR UPDATE OF quantity, unit_price_net, vat_rate
ON public.rgi_invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.rgi_compute_invoice_item_lines();

UPDATE public.rgi_invoice_items
SET
  line_net = round((COALESCE(quantity, 0) * COALESCE(unit_price_net, 0))::numeric, 2),
  line_vat = round((COALESCE(quantity, 0) * COALESCE(unit_price_net, 0) * COALESCE(vat_rate, 0) / 100)::numeric, 2),
  line_gross = round((COALESCE(quantity, 0) * COALESCE(unit_price_net, 0) * (1 + COALESCE(vat_rate, 0) / 100))::numeric, 2);

UPDATE public.rgi_invoices i
SET
  subtotal_net = COALESCE(s.subtotal_net, 0),
  vat_total = COALESCE(s.vat_total, 0),
  total_gross = COALESCE(s.total_gross, 0)
FROM (
  SELECT
    invoice_id,
    sum(line_net) AS subtotal_net,
    sum(line_vat) AS vat_total,
    sum(line_gross) AS total_gross
  FROM public.rgi_invoice_items
  GROUP BY invoice_id
) s
WHERE i.id = s.invoice_id;