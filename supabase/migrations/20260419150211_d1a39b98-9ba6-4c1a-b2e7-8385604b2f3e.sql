-- Set REPLICA IDENTITY FULL for complete row data in update events
ALTER TABLE public.etv_agenda_items REPLICA IDENTITY FULL;
ALTER TABLE public.etv_votes REPLICA IDENTITY FULL;
ALTER TABLE public.etv_meetings REPLICA IDENTITY FULL;
ALTER TABLE public.etv_attendees REPLICA IDENTITY FULL;

-- Add tables to realtime publication (idempotent via DO block)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.etv_agenda_items;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.etv_votes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.etv_meetings;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.etv_attendees;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;