ALTER TABLE public.comm_campaigns DROP CONSTRAINT IF EXISTS comm_campaigns_status_check;
ALTER TABLE public.comm_campaigns ADD CONSTRAINT comm_campaigns_status_check 
  CHECK (status = ANY (ARRAY['draft'::text, 'generating'::text, 'done'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text]));