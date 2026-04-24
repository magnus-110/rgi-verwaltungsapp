-- Convert share_type from enum to text to allow custom share types
ALTER TABLE public.contact_building_shares 
  ALTER COLUMN share_type TYPE text USING share_type::text;

-- Optional: drop the enum if no longer used elsewhere
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE udt_name = 'share_type'
  ) THEN
    DROP TYPE IF EXISTS public.share_type;
  END IF;
END $$;