UPDATE public.emails e
SET has_attachments = EXISTS (
  SELECT 1 FROM public.email_attachments a
  WHERE a.email_id = e.id AND a.is_inline = false
);