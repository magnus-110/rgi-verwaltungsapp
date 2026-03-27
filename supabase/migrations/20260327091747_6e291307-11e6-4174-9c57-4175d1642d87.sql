
-- Allow manual resolutions without meeting/agenda item
ALTER TABLE public.etv_resolutions ALTER COLUMN meeting_id DROP NOT NULL;
ALTER TABLE public.etv_resolutions ALTER COLUMN agenda_item_id DROP NOT NULL;

-- Add source field to distinguish manual vs auto
ALTER TABLE public.etv_resolutions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'meeting';
ALTER TABLE public.etv_resolutions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(user_id);
ALTER TABLE public.etv_resolutions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Allow owners to submit TOPs (add attachment support)
ALTER TABLE public.etv_agenda_items ADD COLUMN IF NOT EXISTS attachment_paths TEXT[];
ALTER TABLE public.etv_agenda_items ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES public.profiles(user_id);
