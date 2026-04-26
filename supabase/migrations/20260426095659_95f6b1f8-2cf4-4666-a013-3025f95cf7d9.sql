-- 1. Dedupe: keep only newest submission per (building_id, user_id, category)
DELETE FROM public.onboarding_submissions a
USING public.onboarding_submissions b
WHERE a.building_id = b.building_id
  AND a.user_id    = b.user_id
  AND a.category   = b.category
  AND a.created_at < b.created_at;

-- 2. Track which individual fields have already been applied to target tables
ALTER TABLE public.onboarding_submissions
  ADD COLUMN IF NOT EXISTS applied_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Prevent future duplicate pending submissions
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_submissions_unique_pending
  ON public.onboarding_submissions (building_id, user_id, category)
  WHERE status = 'pending';