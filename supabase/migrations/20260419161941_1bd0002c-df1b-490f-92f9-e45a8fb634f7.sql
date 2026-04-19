CREATE OR REPLACE FUNCTION public.get_building_dashboard_stats(p_building_id uuid)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'open_invoices', (SELECT COUNT(*) FROM invoices WHERE building_id = p_building_id AND status IN ('open','pending')),
    'open_bookings_review', (SELECT COUNT(*) FROM bookings WHERE building_id = p_building_id AND needs_review = true),
    'unmatched_transactions', (SELECT COUNT(*) FROM bank_transactions WHERE building_id = p_building_id AND match_status != 'matched'),
    'open_todos', (SELECT COUNT(*) FROM todos WHERE building_id = p_building_id AND status != 'done' AND deleted_at IS NULL),
    'open_cases', (SELECT COUNT(*) FROM cases WHERE building_id = p_building_id AND status NOT IN ('resolved','archived')),
    'documents_count', (SELECT COUNT(*) FROM building_files WHERE building_id = p_building_id AND deleted_at IS NULL),
    'file_count', (SELECT COUNT(*) FROM building_files WHERE building_id = p_building_id AND deleted_at IS NULL),
    'owners_count', (SELECT COUNT(DISTINCT contact_id) FROM contact_building_assignments WHERE building_id = p_building_id AND role_in_building = 'eigentuemer'),
    'contact_count', (SELECT COUNT(*) FROM contact_building_assignments WHERE building_id = p_building_id AND is_active = true),
    'forum_count', (SELECT COUNT(*) FROM forum_posts WHERE building_id = p_building_id),
    'last_activity', (SELECT MAX(created_at) FROM building_files WHERE building_id = p_building_id)
  )
$$;