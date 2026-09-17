-- Adress-Typ beschreibt nur noch die Rechtsform (person | company).
-- Dienstleister/Handwerker wird ausschliesslich ueber is_service_provider_pool abgebildet.

-- 1) Alte Typ-Kontakte "service_provider" ohne Kennzeichen bekommen das Kennzeichen
UPDATE public.contacts
SET is_service_provider_pool = true
WHERE contact_type = 'service_provider'
  AND is_service_provider_pool = false;

-- 2) Typ "service_provider" auf "company" normalisieren
UPDATE public.contacts
SET contact_type = 'company'
WHERE contact_type = 'service_provider';
