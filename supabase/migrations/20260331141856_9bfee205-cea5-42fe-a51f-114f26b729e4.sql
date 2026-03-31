-- Delete all contacts except Magnus Göttinger and Cristina van Praag
-- CASCADE will handle contact_persons, contact_phones, contact_emails, contact_bank_accounts, contact_building_assignments etc.
DELETE FROM contacts WHERE id NOT IN (
  '3b7375de-4eac-4e80-b868-9b20cb960a3e',
  '2fe72758-9f30-48f4-ace1-c2dd20c8ed97'
);