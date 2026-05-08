
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS in_app_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS in_app_report_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS in_app_todo_enabled boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.emails; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.weg_reports; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.miete_reports; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.todos; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.todo_assignees; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.emails REPLICA IDENTITY FULL;
ALTER TABLE public.weg_reports REPLICA IDENTITY FULL;
ALTER TABLE public.miete_reports REPLICA IDENTITY FULL;
ALTER TABLE public.todos REPLICA IDENTITY FULL;
ALTER TABLE public.todo_assignees REPLICA IDENTITY FULL;
