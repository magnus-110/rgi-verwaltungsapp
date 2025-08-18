-- Add RLS policies for report-attachments bucket
-- Allow admins full access to all attachments
CREATE POLICY "Admins can manage all attachments"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'report-attachments' AND 
  get_user_role(auth.uid()) = 'admin'::app_role
);

-- Allow users to upload their own attachments
CREATE POLICY "Users can upload their own attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'report-attachments' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view their own attachments
CREATE POLICY "Users can view their own attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'report-attachments' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own attachments
CREATE POLICY "Users can update their own attachments"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'report-attachments' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own attachments
CREATE POLICY "Users can delete their own attachments"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'report-attachments' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);