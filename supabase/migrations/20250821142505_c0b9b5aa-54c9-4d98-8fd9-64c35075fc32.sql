-- Add knowledge_items column to chatbot_settings table
ALTER TABLE public.chatbot_settings 
ADD COLUMN knowledge_items JSONB DEFAULT '[]'::JSONB;

-- Migrate existing knowledge_base data to knowledge_items format
UPDATE public.chatbot_settings 
SET knowledge_items = CASE 
  WHEN knowledge_base IS NOT NULL AND knowledge_base != '' THEN 
    jsonb_build_array(
      jsonb_build_object(
        'title', 'Allgemein', 
        'content', knowledge_base
      )
    )
  ELSE '[]'::JSONB 
END
WHERE knowledge_items = '[]'::JSONB;