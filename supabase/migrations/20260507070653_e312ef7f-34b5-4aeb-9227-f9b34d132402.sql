
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- remove old job if exists
DO $$
BEGIN
  PERFORM cron.unschedule('notify-pending-every-3min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'notify-pending-every-3min',
  '*/3 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/notify-pending',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
