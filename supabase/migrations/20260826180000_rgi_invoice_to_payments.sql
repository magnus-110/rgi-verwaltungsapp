-- ============================================================
-- Eine fertige RGI-Rechnung soll dort auftauchen, wo das Geld
-- bewegt wird: in "Zahlungen" beim Objekt. Bisher lebte sie nur
-- in RGI Intern, und beim naechsten Ueberweisungslauf fuer die
-- WEG fehlte sie schlicht.
--
-- Der Weg dahin ist ein Eintrag in public.invoices - dieselbe
-- Tabelle, aus der sich die Zahlungsliste speist. Damit greifen
-- Beleg, Verwendungszweck, Faelligkeit und Kontierung ohne
-- Sonderweg.
--
-- Drei Teile:
--   1. Verbindung  invoices.rgi_invoice_id
--   2. Rueckmeldung: als bezahlt abgehakt -> Zahlung auf der
--      RGI-Rechnung
--   3. Aufraeumen: storniert -> unbezahlter Eintrag verschwindet
-- ============================================================

-- ---------- 1. Verbindung ----------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS rgi_invoice_id UUID
    REFERENCES public.rgi_invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.rgi_invoice_id IS
  'Gesetzt, wenn dieser Zahlungsposten aus einer eigenen RGI-Rechnung entstanden ist. Verhindert Doppeleintraege und traegt die Bezahlt-Meldung zurueck.';

-- Je RGI-Rechnung hoechstens ein Zahlungsposten. Das PDF wird beim
-- Neuerzeugen ueberschrieben, nicht ein zweites Mal eingestellt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_rgi_invoice_id
  ON public.invoices(rgi_invoice_id)
  WHERE rgi_invoice_id IS NOT NULL;

-- ---------- 2. Rueckmeldung nach RGI Intern ----------
-- Wer in Zahlungen abhakt, soll nicht zusaetzlich in RGI Intern
-- denselben Eingang erfassen muessen. Der offene Rest wird als
-- Zahlung gebucht; rgi_recompute_invoice_paid setzt daraufhin
-- paid_amount und Status der RGI-Rechnung.
--
-- SECURITY DEFINER ist noetig, weil die abhakende Person in
-- Zahlungen keine Schreibrechte auf rgi_payments haben muss.
CREATE OR REPLACE FUNCTION public.rgi_sync_payment_from_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open NUMERIC(12,2);
BEGIN
  IF NEW.rgi_invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Abgehakt: offenen Rest als Zahlung buchen.
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    SELECT GREATEST(COALESCE(total_gross, 0) - COALESCE(paid_amount, 0), 0)
      INTO v_open
      FROM public.rgi_invoices
     WHERE id = NEW.rgi_invoice_id;

    IF COALESCE(v_open, 0) > 0 THEN
      INSERT INTO public.rgi_payments (invoice_id, paid_on, amount, note, source)
      VALUES (
        NEW.rgi_invoice_id,
        COALESCE(NEW.paid_at::date, CURRENT_DATE),
        v_open,
        'Aus Zahlungen uebernommen',
        'zahlungen'
      );
    END IF;

  -- Haken wieder entfernt: die automatische Zahlung geht mit.
  -- Von Hand erfasste Eingaenge bleiben unangetastet.
  ELSIF OLD.status = 'paid' AND NEW.status IS DISTINCT FROM 'paid' THEN
    DELETE FROM public.rgi_payments
     WHERE invoice_id = NEW.rgi_invoice_id
       AND source = 'zahlungen';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rgi_sync_payment_from_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_invoices_rgi_payment_sync ON public.invoices;
CREATE TRIGGER trg_invoices_rgi_payment_sync
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.rgi_sync_payment_from_invoice();

-- ---------- 3. Storno raeumt auf ----------
-- Eine stornierte Rechnung darf in der Zahlungsliste nicht
-- stehenbleiben. Bereits bezahlte Posten bleiben als Beleg
-- erhalten - die sind Teil der Buchhaltung des Objekts.
CREATE OR REPLACE FUNCTION public.rgi_withdraw_cancelled_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    DELETE FROM public.invoices
     WHERE rgi_invoice_id = NEW.id
       AND status <> 'paid';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rgi_withdraw_cancelled_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rgi_invoices_cancel_withdraw ON public.rgi_invoices;
CREATE TRIGGER trg_rgi_invoices_cancel_withdraw
  AFTER UPDATE OF status ON public.rgi_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.rgi_withdraw_cancelled_invoice();
