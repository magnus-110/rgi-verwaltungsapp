-- Reclassify falsely-inline non-image attachments (e.g. Apple Mail sends PDFs as Content-Disposition: inline)
UPDATE public.email_attachments
SET is_inline = false
WHERE is_inline = true
  AND (content_id IS NULL OR content_id = '')
  AND mime_type NOT ILIKE 'image/%';

-- Refresh has_attachments flag based on real (non-inline) attachments
UPDATE public.emails e
SET has_attachments = EXISTS (
  SELECT 1 FROM public.email_attachments a
  WHERE a.email_id = e.id AND a.is_inline = false
);