CREATE TABLE public.email_change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_change_requests_token ON public.email_change_requests(token);
CREATE INDEX idx_email_change_requests_user_id ON public.email_change_requests(user_id);

ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;

-- No policies = no client access. Only service role (edge functions) can read/write.
