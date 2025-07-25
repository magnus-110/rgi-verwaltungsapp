-- Erweitere chatbot_settings um System Prompt und Wissensbasis
ALTER TABLE public.chatbot_settings 
ADD COLUMN system_prompt TEXT DEFAULT 'Sie sind ein hilfreicher Assistent für die Immobilienverwaltung.',
ADD COLUMN knowledge_base TEXT DEFAULT '';

-- Erweitere profiles um Name und Telefon für bessere Datenverknüpfung
ALTER TABLE public.profiles 
ADD COLUMN phone TEXT;