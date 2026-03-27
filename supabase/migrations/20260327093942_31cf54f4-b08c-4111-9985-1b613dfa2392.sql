-- Allow WEG owners to upload attachments for TOP submissions
CREATE POLICY "WEG owners can upload etv attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'building-files'
  AND (storage.foldername(name))[1] = 'etv-attachments'
);
