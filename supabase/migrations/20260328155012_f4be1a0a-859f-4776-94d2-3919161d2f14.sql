-- Clean up duplicate attendees, keeping only the most recent per (meeting_id, assignment_id)
DELETE FROM etv_attendees
WHERE id NOT IN (
  SELECT DISTINCT ON (meeting_id, assignment_id) id
  FROM etv_attendees
  ORDER BY meeting_id, assignment_id, created_at DESC
);

-- Prevent future duplicates
ALTER TABLE etv_attendees
ADD CONSTRAINT etv_attendees_meeting_assignment_unique
UNIQUE (meeting_id, assignment_id);