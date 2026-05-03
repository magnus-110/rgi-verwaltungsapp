WITH bank AS (
  SELECT id FROM chart_of_accounts WHERE account_number = '1800' AND building_id IS NULL LIMIT 1
),
to_drop AS (
  -- Bank-Spiegel: behalten = Zeile mit account_id = Bank, löschen = Spiegel
  SELECT b.id
  FROM bookings b
  JOIN bookings p ON p.id <> b.id
    AND p.building_id = b.building_id
    AND p.fiscal_year = b.fiscal_year
    AND p.booking_date = b.booking_date
    AND p.amount = b.amount
    AND COALESCE(p.description,'') = COALESCE(b.description,'')
    AND p.account_id = b.counter_account_id
    AND p.counter_account_id = b.account_id
    AND p.booking_type <> b.booking_type
    AND p.account_id = (SELECT id FROM bank)
  WHERE b.fiscal_year = 2025
    AND b.building_id = '7805e175-99ee-4fb2-8cd0-0e2f2cf91190'
    AND b.account_id <> (SELECT id FROM bank)
  
  UNION
  
  -- Interne Spiegel ohne Bankbezug: löschen = income-Seite, behalten = expense-Seite
  SELECT b.id
  FROM bookings b
  JOIN bookings p ON p.id <> b.id
    AND p.building_id = b.building_id
    AND p.fiscal_year = b.fiscal_year
    AND p.booking_date = b.booking_date
    AND p.amount = b.amount
    AND COALESCE(p.description,'') = COALESCE(b.description,'')
    AND p.account_id = b.counter_account_id
    AND p.counter_account_id = b.account_id
    AND p.booking_type = 'expense'
  WHERE b.fiscal_year = 2025
    AND b.building_id = '7805e175-99ee-4fb2-8cd0-0e2f2cf91190'
    AND b.booking_type = 'income'
    AND b.account_id <> (SELECT id FROM bank)
    AND b.counter_account_id <> (SELECT id FROM bank)
)
DELETE FROM bookings WHERE id IN (SELECT id FROM to_drop);