
-- Create email-attachments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for email-attachments bucket
CREATE POLICY "Admins and employees can read email attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND public.user_has_admin_access(auth.uid())
);

CREATE POLICY "Admins and employees can upload email attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'email-attachments'
  AND public.user_has_admin_access(auth.uid())
);
