-- Delete all contacts EXCEPT Magnus Göttinger and Cristina van Praag
-- CASCADE will handle contact_persons, contact_phones, contact_emails, 
-- contact_bank_accounts, contact_building_assignments, contact_building_shares, contact_building_costs
DELETE FROM contacts 
WHERE id NOT IN (
  '3b7375de-4eac-4e80-b868-9b20cb960a3e',  -- Magnus Göttinger
  '2fe72758-9f30-48f4-ace1-c2dd20c8ed97'   -- Cristina van Praag
);