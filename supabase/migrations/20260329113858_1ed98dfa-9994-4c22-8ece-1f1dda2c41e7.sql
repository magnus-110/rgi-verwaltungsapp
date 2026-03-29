
-- Drop old INSERT policy
DROP POLICY IF EXISTS "WEG owners can insert their own votes" ON etv_votes;

-- New INSERT policy: allow if user owns the unit OR is the proxy holder for that unit
CREATE POLICY "Owners and proxy holders can insert votes" ON etv_votes
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM etv_attendees ea
    JOIN contact_building_assignments cba ON cba.id = ea.assignment_id
    JOIN contacts c ON c.id = cba.contact_id
    WHERE ea.assignment_id = etv_votes.assignment_id
    AND (
      c.user_id = auth.uid()
      OR ea.proxy_contact_id = (
        SELECT c2.id FROM contacts c2 WHERE c2.user_id = auth.uid() LIMIT 1
      )
    )
  )
);
