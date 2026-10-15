-- Zahlungen: Freigabe mit Puffer je WEG, Zahlläufe (Phase 3, 15.10.2026)
--
-- Ein Zahllauf fasst die freigegebenen Rechnungen EINES Kontos zusammen.
-- Bis die Überweisung per TAN direkt aus der App läuft, entsteht daraus
-- eine SEPA-Datei (pain.001) für das Online-Banking. Kommt die Abbuchung
-- auf dem Konto an, wird die Rechnung automatisch „bezahlt" (Trigger).

-- Puffer je Liegenschaft: fester Betrag; leer = ein Monats-Hausgeld
alter table public.buildings
  add column if not exists zahlungspuffer numeric;
comment on column public.buildings.zahlungspuffer is
  'Mindestbetrag, der nach Zahlungen auf dem Konto bleiben soll. Leer = ein Monats-Hausgeld.';

create or replace view public.v_zahlungspuffer
with (security_invoker = true) as
select
  b.id as building_id,
  b.zahlungspuffer as puffer_eingestellt,
  round(coalesce(hg.monats_hausgeld, 0), 2) as monats_hausgeld,
  coalesce(b.zahlungspuffer, round(coalesce(hg.monats_hausgeld, 0), 2)) as puffer
from public.buildings b
left join (
  select a.building_id,
    sum(case c.interval when 'monatlich' then c.amount when 'quartal' then c.amount / 3 else c.amount / 12 end) as monats_hausgeld
  from public.contact_building_costs c
  join public.contact_building_assignments a on a.id = c.assignment_id
  where c.cost_type = 'Hausgeld'
    and (c.valid_from is null or c.valid_from <= current_date)
    and (c.valid_to is null or c.valid_to >= current_date)
  group by a.building_id
) hg on hg.building_id = b.id;

grant select on public.v_zahlungspuffer to authenticated;

-- Zahlläufe
create table if not exists public.payment_runs (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  konto_iban text not null,
  konto_inhaber text,
  status text not null default 'datei'
    check (status in ('datei', 'gesendet', 'ausgefuehrt', 'abgebrochen', 'fehler')),
  weg text not null default 'datei' check (weg in ('datei', 'fints')),
  ausfuehrung_am date not null default current_date,
  summe numeric not null default 0,
  anzahl integer not null default 0,
  bank_antwort jsonb,
  empfaengerpruefung jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payment_runs(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  empfaenger text not null,
  iban text not null,
  bic text,
  betrag numeric not null check (betrag > 0),
  verwendungszweck text,
  end_to_end_id text not null,
  bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
  bezahlt_am date,
  created_at timestamptz not null default now()
);
create index if not exists payment_run_items_run_idx on public.payment_run_items (run_id);
create index if not exists payment_run_items_offen_idx on public.payment_run_items (iban, betrag) where bank_transaction_id is null;
create index if not exists payment_run_items_invoice_idx on public.payment_run_items (invoice_id);

alter table public.payment_runs enable row level security;
alter table public.payment_run_items enable row level security;

create policy payment_runs_verwaltung on public.payment_runs
  for all to authenticated
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));
create policy payment_run_items_verwaltung on public.payment_run_items
  for all to authenticated
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

revoke all on public.payment_runs from anon;
revoke all on public.payment_run_items from anon;
grant select, insert, update, delete on public.payment_runs to authenticated;
grant select, insert, update, delete on public.payment_run_items to authenticated;

-- Abbuchung gefunden → Rechnung bezahlt
--
-- Läuft bei jeder neuen Kontobewegung (Datei-Import und Abruf über die
-- Bank). Gesucht wird eine noch offene Position eines Zahllaufs vom selben
-- Konto mit gleicher Empfänger-IBAN und gleichem Betrag; die
-- End-to-End-Referenz entscheidet, wenn es mehrere gibt.
create or replace function public.zahllauf_abbuchung_zuordnen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_konto text;
begin
  if new.amount >= 0 or new.creditor_iban is null then
    return new;
  end if;

  select upper(replace(s.account_iban, ' ', '')) into v_konto
  from public.bank_statements s where s.id = new.statement_id;

  select i.id, i.invoice_id, i.run_id into v_item
  from public.payment_run_items i
  join public.payment_runs r on r.id = i.run_id
  where i.bank_transaction_id is null
    and r.status in ('datei', 'gesendet')
    and r.building_id = new.building_id
    and (v_konto is null or upper(replace(r.konto_iban, ' ', '')) = v_konto)
    and upper(replace(i.iban, ' ', '')) = upper(replace(new.creditor_iban, ' ', ''))
    and abs(i.betrag - abs(new.amount)) < 0.005
  order by (new.end_to_end_ref is not null and i.end_to_end_id = new.end_to_end_ref) desc, r.created_at
  limit 1;

  if v_item.id is null then
    return new;
  end if;

  update public.payment_run_items
     set bank_transaction_id = new.id, bezahlt_am = new.booking_date
   where id = v_item.id;

  if v_item.invoice_id is not null then
    update public.invoices
       set status = 'paid', paid_at = coalesce(new.booking_date::timestamptz, now())
     where id = v_item.invoice_id and status <> 'paid';

    if new.matched_invoice_id is null and new.match_status in ('unmatched', 'invoice_pending') then
      update public.bank_transactions
         set matched_invoice_id = v_item.invoice_id, match_status = 'matched_invoice'
       where id = new.id;
    end if;
  end if;

  -- Lauf ausgeführt, wenn keine Position mehr offen ist
  update public.payment_runs r
     set status = 'ausgefuehrt', updated_at = now()
   where r.id = v_item.run_id
     and not exists (select 1 from public.payment_run_items i where i.run_id = r.id and i.bank_transaction_id is null);

  return new;
end;
$$;

create trigger bank_transactions_zahllauf_zuordnen
  after insert on public.bank_transactions
  for each row execute function public.zahllauf_abbuchung_zuordnen();

revoke all on function public.zahllauf_abbuchung_zuordnen() from public, anon, authenticated;
