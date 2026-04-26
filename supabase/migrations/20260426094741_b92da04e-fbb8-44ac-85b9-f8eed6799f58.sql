UPDATE public.onboarding_progress p
SET step5_completed_at = COALESCE(p.step5_completed_at, now()),
    fully_completed_at = COALESCE(p.fully_completed_at, now()),
    updated_at = now()
WHERE p.step5_completed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.onboarding_submissions s
    WHERE s.user_id = p.user_id
      AND s.building_id = p.building_id
      AND s.category = 'bewertung'
  );