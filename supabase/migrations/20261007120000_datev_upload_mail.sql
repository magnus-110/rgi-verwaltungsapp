-- DATEV Upload Mail: RGI-Eingangsrechnungen beim Bezahlt-Setzen an DATEV
-- Unternehmen online schicken (Mandant 11062, RGI Immobilien GmbH & Co. KG).
--
-- Ablauf:
--  * Jede Rechnung hat einen Schalter "DATEV" (datev_upload), Standard an.
--  * Wird eine RGI-Rechnung (is_company_invoice) mit eingeschaltetem Schalter
--    auf "bezahlt" gesetzt, merkt ein Trigger sie vor (datev_queued_at).
--  * Die Edge Function datev-upload-sync schickt vorgemerkte Rechnungen alle
--    10 Minuten per E-Mail an die DATEV-Upload-Adresse.
--  * Rechnungen, die schon vorher bezahlt waren, werden nie vorgemerkt.

-- 1) Absender und Ziel (einmalig hinterlegt)
ALTER TABLE public.rgi_company_settings
  ADD COLUMN IF NOT EXISTS datev_upload_account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS datev_upload_address_incoming text;

UPDATE public.rgi_company_settings
SET datev_upload_address_incoming = COALESCE(datev_upload_address_incoming, '7180face-5f74-47c2-9db1-ac31f91eb400@uploadmail.datev.de'),
    datev_upload_account_id = COALESCE(
      datev_upload_account_id,
      (SELECT id FROM public.email_accounts
        WHERE lower(email_address) = 'info@rgi-immobilien.de'
        ORDER BY created_at
        LIMIT 1)
    );

-- 2) Schalter und Versandstatus je Rechnung
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS datev_upload boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS datev_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS datev_status text,
  ADD COLUMN IF NOT EXISTS datev_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS datev_error text,
  ADD COLUMN IF NOT EXISTS datev_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_invoices_datev_queue
  ON public.invoices (datev_queued_at)
  WHERE datev_queued_at IS NOT NULL AND datev_sent_at IS NULL;

-- 3) Beim Bezahlt-Setzen vormerken (egal ob von Hand oder über den Kontoabgleich)
CREATE OR REPLACE FUNCTION public.invoices_queue_datev_upload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid'
     AND OLD.status IS DISTINCT FROM 'paid'
     AND NEW.is_company_invoice IS TRUE
     AND NEW.datev_upload IS TRUE
     AND NEW.datev_sent_at IS NULL
     AND NEW.duplicate_of IS NULL
     AND NEW.invoice_type IS DISTINCT FROM 'credit_note'
     AND NEW.file_path IS NOT NULL THEN
    NEW.datev_queued_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_queue_datev_upload ON public.invoices;
CREATE TRIGGER trg_invoices_queue_datev_upload
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_queue_datev_upload();

-- 4) Alle 10 Minuten vorgemerkte Rechnungen verschicken
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'datev-upload-sync';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'datev-upload-sync',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/datev-upload-sync',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
