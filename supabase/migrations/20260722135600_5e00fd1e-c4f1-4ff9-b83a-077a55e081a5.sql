UPDATE public.surveys
SET opens_at = COALESCE(opens_at, now()),
    closes_at = COALESCE(closes_at, now() + interval '30 days')
WHERE id = '6e82b1f2-219b-4645-bef6-62a15a0e7819';