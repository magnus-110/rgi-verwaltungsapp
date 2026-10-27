-- Text aus E-Mail-Anhängen (OCR bzw. direkt ausgelesen), damit Anhänge durchsuchbar und lesbar sind.
alter table public.email_attachments
  add column if not exists extracted_text text,
  add column if not exists text_status text,          -- ok | nicht_lesbar | zu_gross | fehler
  add column if not exists text_fehler text,
  add column if not exists text_extrahiert_am timestamptz;
create index if not exists email_attachments_text_offen on public.email_attachments (created_at desc) where text_status is null;
-- Zeitplan: alle 5 Minuten neue Anhänge lesen
select cron.schedule('email-anhaenge-lesen', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/email-anhaenge-lesen',
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fints_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
