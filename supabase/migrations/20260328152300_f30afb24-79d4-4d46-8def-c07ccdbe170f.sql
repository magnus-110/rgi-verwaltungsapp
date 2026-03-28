-- Owners can read their own contact record
CREATE POLICY "WEG owners can view own contact"
ON contacts FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Owners can read their own building assignments
CREATE POLICY "WEG owners can view own building assignments"
ON contact_building_assignments FOR SELECT TO authenticated
USING (
  contact_id IN (
    SELECT id FROM contacts WHERE user_id = auth.uid()
  )
);

-- Owners can read their own building shares
CREATE POLICY "WEG owners can view own building shares"
ON contact_building_shares FOR SELECT TO authenticated
USING (
  assignment_id IN (
    SELECT cba.id FROM contact_building_assignments cba
    JOIN contacts c ON c.id = cba.contact_id
    WHERE c.user_id = auth.uid()
  )
);