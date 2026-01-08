-- Add RLS policies for document_chat_settings table
ALTER TABLE public.document_chat_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read settings
CREATE POLICY "Allow authenticated users to read document_chat_settings"
ON public.document_chat_settings
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert settings
CREATE POLICY "Allow authenticated users to insert document_chat_settings"
ON public.document_chat_settings
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update settings
CREATE POLICY "Allow authenticated users to update document_chat_settings"
ON public.document_chat_settings
FOR UPDATE
TO authenticated
USING (true);