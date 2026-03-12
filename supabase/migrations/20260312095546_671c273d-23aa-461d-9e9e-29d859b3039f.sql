
SELECT
  cron.schedule(
    'cleanup-deleted-todos-daily',
    '0 3 * * *',
    $$
    select net.http_post(
      url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/cleanup-deleted-todos',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
    $$
  );
