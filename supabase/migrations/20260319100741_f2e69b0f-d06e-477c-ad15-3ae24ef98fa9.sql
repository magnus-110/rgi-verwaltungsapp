
-- Migration: Copy weg_owners into contacts system (all steps)
-- Step 1: Insert contacts
INSERT INTO public.contacts (id, first_name, last_name, created_at, updated_at)
SELECT wo.id, wo.first_name, wo.last_name, wo.created_at, wo.updated_at
FROM public.weg_owners wo
ON CONFLICT (id) DO NOTHING;

-- Step 2: Create contact_emails
INSERT INTO public.contact_emails (contact_id, email, label, is_primary)
SELECT wo.id, wo.email, 'Privat', true
FROM public.weg_owners wo
WHERE wo.email IS NOT NULL AND wo.email != '';

-- Step 3: Create contact_phones (only where phone exists)
INSERT INTO public.contact_phones (contact_id, phone_number, label)
SELECT wo.id, wo.phone, 'Mobil'
FROM public.weg_owners wo
WHERE wo.phone IS NOT NULL AND btrim(wo.phone) != '';

-- Step 4: Create building assignments using wo.id as contact_id
INSERT INTO public.contact_building_assignments (contact_id, building_id, role_in_building, is_active)
SELECT wo.id, wb.building_id, 'eigentuemer', true
FROM public.weg_owner_buildings wb
INNER JOIN public.weg_owners wo ON wo.user_id = wb.user_id;
