DELETE FROM contact_building_costs WHERE assignment_id IN (
  SELECT id FROM contact_building_assignments WHERE contact_id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97')
);

DELETE FROM contact_building_shares WHERE assignment_id IN (
  SELECT id FROM contact_building_assignments WHERE contact_id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97')
);

DELETE FROM contact_building_assignments WHERE contact_id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97');

DELETE FROM contact_bank_accounts WHERE contact_id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97');

DELETE FROM contact_phones WHERE contact_id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97');

DELETE FROM contact_emails WHERE contact_id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97');

DELETE FROM contact_persons WHERE contact_id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97');

DELETE FROM contacts WHERE id NOT IN ('3b7375de-4eac-4e80-b868-9b20cb960a3e', '2fe72758-9f30-48f4-ace1-c2dd20c8ed97');