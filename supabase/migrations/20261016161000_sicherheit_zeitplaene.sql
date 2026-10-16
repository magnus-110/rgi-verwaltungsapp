-- Zeitpläne und DB-Trigger schicken den Zeitplan-Schlüssel (Tresor: fints_cron_token)
-- im Header "x-cron-secret" mit. Angewendet per Skript (siehe Supabase-Migration
-- "sicherheit_zeitplaene"): betroffen sind die pg_cron-Jobs cleanup-deleted-emails,
-- cleanup-deleted-todos-daily, comm-dispatch-scheduled, datev-upload-sync,
-- dispatch-scheduled-emails-every-min, fetch-emails-cron, generate-maintenance-tasks-daily,
-- key-loan-check-overdue-daily, nightly-tick, notify-pending-every-3min sowie die Trigger-
-- Funktionen trg_enqueue_booking_embedding() und handle_resolution_actionable().
select 1;
