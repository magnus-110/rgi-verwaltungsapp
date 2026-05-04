-- Entfernt veralteten Trigger + Funktion, die noch parent_case_id referenzieren
DROP TRIGGER IF EXISTS trg_cases_log_parent_link ON public.cases;
DROP TRIGGER IF EXISTS cases_log_parent_link ON public.cases;
DROP FUNCTION IF EXISTS public.cases_log_parent_link() CASCADE;