-- Fix the specific transaction: link it to the correct invoice
UPDATE bank_transactions
SET matched_invoice_id = '7e408894-bf75-42ca-b556-d87d1fde1281'
WHERE id = 'f498dba5-daf4-48a3-bf3e-485ec72fe362'
  AND matched_invoice_id IS NULL;