-- Hausgeld je Eigentümer, wie es der Wirtschaftsplan-Editor berechnet –
-- damit die Dauerlastschrift es übernehmen kann, ohne den Plan neu zu rechnen.
alter table public.economic_plans
  add column if not exists hausgeld_je_eigentuemer jsonb,
  add column if not exists hausgeld_berechnet_am timestamptz;
