-- Create table for document chat settings
CREATE TABLE public.document_chat_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_prompt TEXT,
  model TEXT DEFAULT 'mistral-large-latest',
  temperature NUMERIC DEFAULT 0.3,
  max_tokens INTEGER DEFAULT 2000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_chat_settings ENABLE ROW LEVEL SECURITY;

-- Allow admins to read and update settings
CREATE POLICY "Admins can read document chat settings"
ON public.document_chat_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can insert document chat settings"
ON public.document_chat_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can update document chat settings"
ON public.document_chat_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Insert default settings
INSERT INTO public.document_chat_settings (system_prompt, model, temperature, max_tokens)
VALUES (
  'Du bist ein hilfreicher Assistent für die Immobilienverwaltung. Du beantwortest Fragen basierend auf den bereitgestellten Dokumenten.

WICHTIGE REGELN:
1. Antworte NUR basierend auf den bereitgestellten Dokumenten
2. Wenn die Information nicht in den Dokumenten vorhanden ist, sage das klar
3. Gib immer die Quelle an (Dokument, Seite, Abschnitt)
4. Beziehe dich auf vorherige Fragen in der Konversation wenn relevant
5. Antworte auf Deutsch
6. Sei präzise und hilfreich',
  'mistral-large-latest',
  0.3,
  2000
);