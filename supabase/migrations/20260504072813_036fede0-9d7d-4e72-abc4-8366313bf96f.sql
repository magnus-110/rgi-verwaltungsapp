DROP TRIGGER IF EXISTS trg_subcase_lifecycle ON public.cases;
DROP FUNCTION IF EXISTS public.handle_subcase_lifecycle() CASCADE;