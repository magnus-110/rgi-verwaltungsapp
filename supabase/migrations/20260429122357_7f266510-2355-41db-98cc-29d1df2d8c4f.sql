-- 1) Recreate the partial unique index to include assignment_id
DROP INDEX IF EXISTS public.onboarding_submissions_unique_pending;

CREATE UNIQUE INDEX onboarding_submissions_unique_pending
  ON public.onboarding_submissions (building_id, user_id, category, COALESCE(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';

-- 2) Split legacy rows that contain payload.per_unit into per-assignment rows
DO $$
DECLARE
  r RECORD;
  k TEXT;
  v JSONB;
BEGIN
  FOR r IN
    SELECT * FROM public.onboarding_submissions
    WHERE category = 'wohnungsdaten'
      AND assignment_id IS NULL
      AND payload ? 'per_unit'
      AND jsonb_typeof(payload->'per_unit') = 'object'
  LOOP
    FOR k, v IN SELECT * FROM jsonb_each(r.payload->'per_unit') LOOP
      IF k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        INSERT INTO public.onboarding_submissions (
          user_id, contact_id, building_id, assignment_id,
          category, payload, status, applied_fields, created_at, updated_at
        ) VALUES (
          r.user_id, r.contact_id, r.building_id, k::uuid,
          r.category, v, r.status, COALESCE(r.applied_fields, '[]'::jsonb),
          r.created_at, now()
        );
      END IF;
    END LOOP;
    DELETE FROM public.onboarding_submissions WHERE id = r.id;
  END LOOP;
END$$;