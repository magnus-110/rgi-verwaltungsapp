-- Bestandsdaten: vorhandene Zuordnungen mit der Rolle 'beirat' sind in Wahrheit
-- Eigentümerzuordnungen. Sie werden auf 'eigentuemer' gestellt und behalten die
-- Beiratsmitgliedschaft als Funktionskennzeichen.
-- Idempotent: wo bereits korrigiert, passiert nichts.

UPDATE public.contact_building_assignments
SET role_in_building = 'eigentuemer',
    is_beirat = true
WHERE role_in_building = 'beirat';
