-- Backfill: nur echte (non-inline) Anhänge sollen die Büroklammer auslösen.
-- Mails ohne irgendeine email_attachments-Zeile bleiben unverändert (true bleibt true),
-- damit der Nachlade-Button weiter angeboten wird.
UPDATE public.emails e
SET has_attachments = false
WHERE has_attachments = true
  AND EXISTS (SELECT 1 FROM public.email_attachments a WHERE a.email_id = e.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.email_attachments a
    WHERE a.email_id = e.id AND a.is_inline = false
  );