-- Elektronische Unterschrift: Zeitplan alle 10 Minuten
-- (Erinnerungen, Aufgaben bei Fristende, Zuordnung von Papier-Rücksendungen per E-Mail mit [SIG-…] im Betreff,
--  nachgeholte Abschlüsse). Muster wie 20261027110000_email_attachments_text.sql.
select cron.unschedule('sign-request-cron') where exists (select 1 from cron.job where jobname = 'sign-request-cron');

select cron.schedule('sign-request-cron', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/sign-request',
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fints_cron_token')),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
