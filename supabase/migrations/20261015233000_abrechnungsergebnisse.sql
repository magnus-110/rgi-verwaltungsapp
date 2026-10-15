-- Ergebnis der Jahresabrechnung je Eigentümer (15.10.2026)
-- Wird in der Abrechnung per Knopf „Als beschlossen speichern" festgehalten
-- und im Zahlungsauftrag „Abrechnungsspitze" vorbefüllt.
-- nachzahlung > 0: Eigentümer zahlt nach (Einzug); < 0: Guthaben (Auszahlung).
create table if not exists public.settlement_results (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  billing_period_id uuid not null references public.billing_periods(id) on delete cascade,
  assignment_id uuid not null references public.contact_building_assignments(id) on delete cascade,
  geschaeftsjahr int,
  nachzahlung numeric not null default 0,
  beschlossen_am date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (billing_period_id, assignment_id)
);
create index if not exists settlement_results_building_idx on public.settlement_results (building_id, beschlossen_am desc);
alter table public.settlement_results enable row level security;
create policy settlement_results_verwaltung on public.settlement_results for all to authenticated
  using (public.user_has_admin_access(auth.uid())) with check (public.user_has_admin_access(auth.uid()));
revoke all on public.settlement_results from anon;
grant select, insert, update, delete on public.settlement_results to authenticated;
