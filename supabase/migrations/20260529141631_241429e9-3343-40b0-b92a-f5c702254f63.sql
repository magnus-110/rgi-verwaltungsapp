ALTER TABLE public.document_chat_settings
  ALTER COLUMN model SET DEFAULT 'mistral-medium-3-5';

UPDATE public.document_chat_settings
   SET model = 'mistral-medium-3-5', updated_at = now()
 WHERE model IN ('mistral-large-latest', 'mistral-medium-latest');