
-- Backfill: Set assigned_to for existing emails where the account has exactly one user assigned
UPDATE emails e
SET assigned_to = sub.user_id
FROM (
  SELECT account_id, MIN(user_id::text)::uuid AS user_id
  FROM email_account_users
  GROUP BY account_id
  HAVING COUNT(*) = 1
) sub
WHERE e.account_id = sub.account_id
  AND e.assigned_to IS NULL;
