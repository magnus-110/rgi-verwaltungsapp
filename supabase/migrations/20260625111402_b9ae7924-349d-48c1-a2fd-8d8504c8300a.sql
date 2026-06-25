ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS call_logs_case_id_idx ON public.call_logs(case_id);