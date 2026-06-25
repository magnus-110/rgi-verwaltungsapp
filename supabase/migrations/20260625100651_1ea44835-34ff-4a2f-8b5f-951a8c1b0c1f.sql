DELETE FROM public.email_attachments a
USING public.email_attachments b
WHERE a.email_id = b.email_id
  AND a.file_name = b.file_name
  AND COALESCE(a.is_inline,false) = COALESCE(b.is_inline,false)
  AND COALESCE(a.content_id,'') = COALESCE(b.content_id,'')
  AND a.created_at < b.created_at;