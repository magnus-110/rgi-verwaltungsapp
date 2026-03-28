
-- Add sqm_weight to etv_votes for sqm-based voting
ALTER TABLE public.etv_votes ADD COLUMN IF NOT EXISTS sqm_weight numeric DEFAULT 0;
