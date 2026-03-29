
-- Add is_secret_ballot column to etv_meetings
ALTER TABLE public.etv_meetings ADD COLUMN IF NOT EXISTS is_secret_ballot boolean NOT NULL DEFAULT true;

-- Update get_attendee_by_proxy_token to include is_secret_ballot
CREATE OR REPLACE FUNCTION public.get_attendee_by_proxy_token(p_token text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT row_to_json(r) FROM (
    SELECT 
      a.id,
      a.proxy_external_name,
      a.proxy_token_used,
      a.attendance_type,
      a.proxy_type,
      a.assignment_id,
      json_build_object(
        'id', m.id,
        'title', m.title,
        'meeting_date', m.meeting_date,
        'location', m.location,
        'status', m.status,
        'is_secret_ballot', m.is_secret_ballot,
        'buildings', json_build_object(
          'name', b.name,
          'address', b.address
        )
      ) as etv_meetings
    FROM etv_attendees a
    JOIN etv_meetings m ON m.id = a.meeting_id
    JOIN buildings b ON b.id = m.building_id
    WHERE a.proxy_token = p_token
    LIMIT 1
  ) r;
$function$;
