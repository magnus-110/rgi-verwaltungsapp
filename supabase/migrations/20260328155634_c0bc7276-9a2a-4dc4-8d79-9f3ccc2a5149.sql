-- Allow anyone (including unauthenticated) to view an attendee record by proxy_token
CREATE POLICY "Anyone can view attendee by proxy_token"
ON public.etv_attendees
FOR SELECT
TO anon, authenticated
USING (proxy_token IS NOT NULL AND proxy_token = current_setting('request.headers', true)::json->>'x-proxy-token');

-- Simpler approach: allow SELECT when proxy_token matches (for the proxy landing page)
-- Actually, since we can't pass headers easily from the client, let's allow reading rows that have a non-null proxy_token
-- But that would expose all proxy rows. Instead, use a function approach.

-- Drop the complex policy and use a simpler one
DROP POLICY IF EXISTS "Anyone can view attendee by proxy_token" ON public.etv_attendees;

-- Create a security definer function to look up by token
CREATE OR REPLACE FUNCTION public.get_attendee_by_proxy_token(p_token text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(r) FROM (
    SELECT 
      a.id,
      a.proxy_external_name,
      a.proxy_token_used,
      a.attendance_type,
      a.proxy_type,
      json_build_object(
        'id', m.id,
        'title', m.title,
        'meeting_date', m.meeting_date,
        'location', m.location,
        'status', m.status,
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
$$;