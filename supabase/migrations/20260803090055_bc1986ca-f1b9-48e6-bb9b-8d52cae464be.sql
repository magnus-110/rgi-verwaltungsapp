-- Nachtrag der korrekt geparsten E-Rechnungsdaten (nur leere Felder werden gefüllt)
UPDATE public.invoices SET
  invoice_date = COALESCE(invoice_date, DATE '2026-07-31'),
  due_date     = COALESCE(due_date, DATE '2026-07-31'),
  net_amount   = COALESCE(net_amount, 120),
  vat_amount   = COALESCE(vat_amount, 22.80),
  vendor_iban  = COALESCE(vendor_iban, 'DE82110101015779777967'),
  line_items   = CASE WHEN line_items IS NULL OR line_items = '[]'::jsonb
                 THEN '[{"description":"Gartenpflege","quantity":1,"unit_price":120,"net_amount":120,"amount":120,"vat_rate":19}]'::jsonb
                 ELSE line_items END
WHERE id = '0d5ba4ff-db45-4eeb-92e3-4124ea3d892c';

UPDATE public.invoices SET
  invoice_date = COALESCE(invoice_date, DATE '2026-06-27'),
  due_date     = COALESCE(due_date, DATE '2026-06-27'),
  net_amount   = COALESCE(net_amount, 155),
  vat_amount   = COALESCE(vat_amount, 29.45),
  vendor_iban  = COALESCE(vendor_iban, 'DE82110101015779777967'),
  line_items   = CASE WHEN line_items IS NULL OR line_items = '[]'::jsonb
                 THEN '[{"description":"Gartenpflege","quantity":1,"unit_price":120,"net_amount":120,"amount":120,"vat_rate":19},{"description":"Enstorgung","quantity":1,"unit_price":35,"net_amount":35,"amount":35,"vat_rate":19}]'::jsonb
                 ELSE line_items END
WHERE id = '6acdcebc-0d65-4284-a5e2-9d42f396ba6c';

UPDATE public.invoices SET
  invoice_date = COALESCE(invoice_date, DATE '2026-07-07'),
  due_date     = COALESCE(due_date, DATE '2026-07-15'),
  net_amount   = COALESCE(net_amount, 90),
  vat_amount   = COALESCE(vat_amount, 17.10),
  vendor_iban  = COALESCE(vendor_iban, 'DE90733500000516022753'),
  line_items   = CASE WHEN line_items IS NULL OR line_items = '[]'::jsonb
                 THEN '[{"description":"- Support nach Aufwand in Stunden -","quantity":0.75,"unit_price":120,"net_amount":90,"amount":90,"vat_rate":19}]'::jsonb
                 ELSE line_items END
WHERE id = 'dcf86a46-a076-44eb-9bda-3892e7216ded';

UPDATE public.invoices SET
  invoice_date = COALESCE(invoice_date, DATE '2026-07-15'),
  due_date     = COALESCE(due_date, DATE '2026-07-20'),
  net_amount   = COALESCE(net_amount, 356),
  vat_amount   = COALESCE(vat_amount, 67.64),
  vendor_iban  = COALESCE(vendor_iban, 'DE03760800400133016000'),
  line_items   = CASE WHEN line_items IS NULL OR line_items = '[]'::jsonb
                 THEN '[{"description":"immo Next Level Power","quantity":1,"unit_price":356,"net_amount":356,"amount":356,"vat_rate":19}]'::jsonb
                 ELSE line_items END
WHERE id = 'bae1ca7c-0a6d-4a8e-ade1-58d81d53e1c4';

UPDATE public.invoices SET
  invoice_date = COALESCE(invoice_date, DATE '2026-05-15'),
  due_date     = COALESCE(due_date, DATE '2026-05-20'),
  net_amount   = COALESCE(net_amount, 356),
  vat_amount   = COALESCE(vat_amount, 67.64),
  vendor_iban  = COALESCE(vendor_iban, 'DE03760800400133016000'),
  line_items   = CASE WHEN line_items IS NULL OR line_items = '[]'::jsonb
                 THEN '[{"description":"immo Next Level Power","quantity":1,"unit_price":356,"net_amount":356,"amount":356,"vat_rate":19}]'::jsonb
                 ELSE line_items END
WHERE id = 'b2ebd5f7-7d17-4962-a1ec-b29b57314e91';