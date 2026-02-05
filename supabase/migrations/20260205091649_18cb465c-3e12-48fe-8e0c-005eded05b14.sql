-- Add terms_accepted column to profiles table for tracking AGB/Datenschutz acceptance
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Timestamp when user accepted AGB and Datenschutzerklärung';