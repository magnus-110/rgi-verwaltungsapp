ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS address_as_separate_letter boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.contact_building_assignments.address_as_separate_letter IS
  'Wenn true: Mit-Eigentümer erhält eigenes Anschreiben/Rundmail. Wenn false: Wird im Anschreiben des Haupt-Eigentümers (parent_assignment_id) mit-adressiert.';