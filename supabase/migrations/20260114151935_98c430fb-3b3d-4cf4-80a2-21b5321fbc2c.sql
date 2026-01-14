-- Add sort_order column to prompt_templates for drag-and-drop ordering
ALTER TABLE public.prompt_templates 
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;