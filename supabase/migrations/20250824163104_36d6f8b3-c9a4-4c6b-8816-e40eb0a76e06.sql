-- Check if report-attachments bucket exists and ensure it's properly configured
-- If it doesn't exist, create it
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-attachments', 'report-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for report-attachments bucket
CREATE POLICY "Admins can view all attachments" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'report-attachments' AND
  auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE role = 'admin'
  )
);

CREATE POLICY "Users can view their own report attachments" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'report-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can manage all attachments" ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'report-attachments' AND
  auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'report-attachments' AND
  auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE role = 'admin'
  )
);

CREATE POLICY "Users can upload report attachments" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'report-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);