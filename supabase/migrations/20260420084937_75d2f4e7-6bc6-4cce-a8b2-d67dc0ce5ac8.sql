-- Phase 2: scheduled send + email attachments + retry support
ALTER TABLE public.comm_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachment_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS combined_pdf_path text;

CREATE INDEX IF NOT EXISTS idx_comm_campaigns_scheduled
  ON public.comm_campaigns (scheduled_at)
  WHERE status = 'scheduled';

-- pg_cron job to dispatch scheduled email campaigns every minute
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'comm-dispatch-scheduled') THEN
    PERFORM cron.schedule(
      'comm-dispatch-scheduled',
      '* * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/comm-dispatch-scheduled',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
        body := '{}'::jsonb
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;