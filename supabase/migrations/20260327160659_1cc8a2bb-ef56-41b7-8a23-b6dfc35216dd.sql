
-- Vorauszahlungskonten für Versorgung (globale Konten)
INSERT INTO chart_of_accounts (account_number, account_name, category, is_billing_relevant, is_heating_relevant, carry_forward_balance, default_distribution_key, sort_order)
VALUES
  ('1470', 'Vorauszahlungen Gas', '2. Heizung & Warme BK', false, true, true, NULL, 0),
  ('1471', 'Vorauszahlungen Fernwärme', '2. Heizung & Warme BK', false, true, true, NULL, 0),
  ('1472', 'Vorauszahlungen Strom (Allgemein)', '1. Umlagefähige Betriebskosten', false, false, true, NULL, 0),
  ('1473', 'Vorauszahlungen Wasser', '1. Umlagefähige Betriebskosten', false, false, true, NULL, 0)
ON CONFLICT DO NOTHING;
