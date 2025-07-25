-- Add phone field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN phone TEXT;

-- Add system_prompt and knowledge_base fields to chatbot_settings table
ALTER TABLE public.chatbot_settings
ADD COLUMN system_prompt TEXT,
ADD COLUMN knowledge_base TEXT;