-- Enable real-time for reports tables
ALTER TABLE public.miete_reports REPLICA IDENTITY FULL;
ALTER TABLE public.weg_reports REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.miete_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weg_reports;