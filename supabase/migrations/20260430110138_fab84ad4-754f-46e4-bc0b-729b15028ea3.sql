-- Standard-Ertragskonto "1745 Erstattungen / Gutschriften" für jede Liegenschaft seeden
INSERT INTO chart_of_accounts (
  account_number, account_name, category, building_id,
  is_billing_relevant, is_distributable, sort_order, is_system_account
)
SELECT 
  '1745', 'Erstattungen / Gutschriften', '4. WEG-Systemkonten & Rücklagen',
  b.id, false, false, 1745, false
FROM buildings b
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa.building_id = b.id AND coa.account_number = '1745'
);

-- Index für schnellen Lookup offener Belege beim Bank-Match
CREATE INDEX IF NOT EXISTS idx_invoices_credit_open
  ON invoices(invoice_type, status, gross_amount)
  WHERE invoice_type = 'credit_note' AND status = 'credit_open';
