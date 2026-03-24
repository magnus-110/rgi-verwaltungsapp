
-- 1. Create contact_type enum
DO $$ BEGIN
  CREATE TYPE public.contact_type AS ENUM ('person', 'company', 'owner_group', 'service_provider');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add contact_type to contacts table
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS contact_type public.contact_type DEFAULT 'person';

-- 3. Add person_id to contact_phones, contact_emails, contact_bank_accounts
ALTER TABLE public.contact_phones ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES public.contact_persons(id) ON DELETE CASCADE;
ALTER TABLE public.contact_emails ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES public.contact_persons(id) ON DELETE CASCADE;
ALTER TABLE public.contact_bank_accounts ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES public.contact_persons(id) ON DELETE CASCADE;

-- 4. Data migration: create contact_persons for existing contacts that have first_name/last_name but no persons yet
INSERT INTO public.contact_persons (contact_id, salutation, first_name, last_name, is_primary, sort_order)
SELECT c.id, c.salutation, c.first_name, c.last_name, true, 0
FROM public.contacts c
WHERE (c.first_name IS NOT NULL OR c.last_name IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.contact_persons cp WHERE cp.contact_id = c.id);

-- 5. Assign existing phones/emails/banks to the newly created person (where person_id is null and contact has exactly one person)
UPDATE public.contact_phones cp
SET person_id = (SELECT id FROM public.contact_persons WHERE contact_id = cp.contact_id AND is_primary = true LIMIT 1)
WHERE cp.person_id IS NULL
  AND (SELECT COUNT(*) FROM public.contact_persons WHERE contact_id = cp.contact_id) = 1;

UPDATE public.contact_emails ce
SET person_id = (SELECT id FROM public.contact_persons WHERE contact_id = ce.contact_id AND is_primary = true LIMIT 1)
WHERE ce.person_id IS NULL
  AND (SELECT COUNT(*) FROM public.contact_persons WHERE contact_id = ce.contact_id) = 1;

UPDATE public.contact_bank_accounts cb
SET person_id = (SELECT id FROM public.contact_persons WHERE contact_id = cb.contact_id AND is_primary = true LIMIT 1)
WHERE cb.person_id IS NULL
  AND (SELECT COUNT(*) FROM public.contact_persons WHERE contact_id = cb.contact_id) = 1;

-- 6. Set contact_type based on company_name
UPDATE public.contacts SET contact_type = 'company' WHERE company_name IS NOT NULL AND company_name != '' AND contact_type = 'person';
