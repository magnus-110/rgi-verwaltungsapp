
-- Create storage bucket for email attachments (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read from email-attachments bucket
CREATE POLICY "Authenticated users can read email attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'email-attachments');

-- Allow service role to upload (via edge functions)
CREATE POLICY "Service role can upload email attachments"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'email-attachments');

CREATE POLICY "Service role can update email attachments"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'email-attachments');
