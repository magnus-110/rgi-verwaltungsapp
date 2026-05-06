ALTER TABLE public.booking_templates 
ADD COLUMN IF NOT EXISTS linked_document_id uuid REFERENCES public.building_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_templates_linked_document_id ON public.booking_templates(linked_document_id);