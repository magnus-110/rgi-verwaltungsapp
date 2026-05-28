CREATE OR REPLACE FUNCTION public.search_emails(
  p_search text,
  p_account_ids uuid[] DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_assigned_filter text DEFAULT 'all',
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS SETOF public.emails
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.*
  FROM public.emails e
  WHERE public.user_has_admin_access(auth.uid())
    AND e.deleted_at IS NULL
    AND (p_account_ids IS NULL OR e.account_id = ANY(p_account_ids))
    AND (
      p_assigned_filter = 'all'
      OR (p_assigned_filter = 'unassigned' AND e.assigned_to IS NULL)
      OR (p_assigned_filter = 'user' AND e.assigned_to = p_assigned_to)
    )
    AND (
      p_search IS NULL
      OR length(btrim(p_search)) = 0
      OR e.subject ILIKE '%' || p_search || '%'
      OR e.from_name ILIKE '%' || p_search || '%'
      OR e.from_address ILIKE '%' || p_search || '%'
      OR coalesce(e.body_text,'') ILIKE '%' || p_search || '%'
      OR coalesce(e.to_addresses::text,'') ILIKE '%' || p_search || '%'
      OR coalesce(e.cc_addresses::text,'') ILIKE '%' || p_search || '%'
    )
  ORDER BY e.date DESC NULLS LAST
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.search_emails(text, uuid[], uuid, text, int, int) TO authenticated;