-- Add web_system_prompt column to document_chat_settings
ALTER TABLE public.document_chat_settings 
ADD COLUMN IF NOT EXISTS web_system_prompt TEXT;