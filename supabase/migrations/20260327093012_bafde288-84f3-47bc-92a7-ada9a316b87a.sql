
-- New table for owner-submitted TOPs (independent of meetings)
CREATE TABLE public.etv_submitted_tops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  submitted_by_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  attachment_paths TEXT[],
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, deferred
  accepted_into_meeting_id UUID REFERENCES etv_meetings(id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.etv_submitted_tops ENABLE ROW LEVEL SECURITY;

-- Owners can view their own submitted TOPs
CREATE POLICY "Owners can view own submitted tops"
ON public.etv_submitted_tops
FOR SELECT
TO authenticated
USING (submitted_by_user_id = auth.uid());

-- Owners can insert their own submitted TOPs
CREATE POLICY "Owners can insert own submitted tops"
ON public.etv_submitted_tops
FOR INSERT
TO authenticated
WITH CHECK (submitted_by_user_id = auth.uid());

-- Admins can manage all submitted TOPs
CREATE POLICY "Admins can manage submitted tops"
ON public.etv_submitted_tops
FOR ALL
TO authenticated
USING (user_has_admin_access(auth.uid()))
WITH CHECK (user_has_admin_access(auth.uid()));
