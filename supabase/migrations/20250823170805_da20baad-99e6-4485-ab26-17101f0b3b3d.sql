
BEGIN;

ALTER TABLE public.chatbot_messages
  ALTER COLUMN management_mode
  TYPE public.management_mode
  USING (management_mode::text::public.management_mode);

COMMIT;
