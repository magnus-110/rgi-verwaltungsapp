-- Phase 4: SEPA-Mandate, Aufträge (Überweisung, Einzug, Dauerlastschrift)
-- und Lastschriften in der Freigabe (15.10.2026)

-- ── SEPA-Mandate ────────────────────────────────────────────────────────────
-- Ein Mandat je Eigentümer-Zuordnung (Einheit). Die Referenz vergibt die App
-- und ändert sie nie; bestehende Referenzen bleiben, wie sie sind.
create table if not exists public.sepa_mandates (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  assignment_id uuid references public.contact_building_assignments(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  mandatsreferenz text not null,
  kontoinhaber text,
  iban text,
  bic text,
  unterschrieben_am date,
  dokument_pfad text,
  dokument_name text,
  quelle text not null default 'buero' check (quelle in ('buero', 'eigentuemer', 'scan', 'uebernahme')),
  status text not null default 'aktiv' check (status in ('aktiv', 'widerrufen', 'ersetzt')),
  zuletzt_genutzt date,
  notiz text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sepa_mandates_referenz_idx on public.sepa_mandates (building_id, mandatsreferenz);
create index if not exists sepa_mandates_assignment_idx on public.sepa_mandates (assignment_id) where status = 'aktiv';

comment on table public.sepa_mandates is 'SEPA-Lastschriftmandate je Eigentümer-Einheit. Zahlungsempfänger ist die WEG (Gläubiger-ID der Liegenschaft).';

-- Mandatsreferenz: RGI-<4 Zeichen Liegenschaft>-<Einheit>-<laufende Nr.>
create or replace function public.neue_mandatsreferenz(p_building uuid, p_unit text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kurz text;
  v_einheit text;
  v_n int;
  v_ref text;
begin
  select upper(left(regexp_replace(coalesce(name, 'WEG'), '[^A-Za-z0-9]', '', 'g'), 4)) into v_kurz from buildings where id = p_building;
  v_einheit := upper(left(regexp_replace(coalesce(nullif(p_unit, ''), '0'), '[^A-Za-z0-9]', '', 'g'), 8));
  v_n := 1;
  loop
    v_ref := 'RGI-' || coalesce(nullif(v_kurz, ''), 'WEG') || '-' || v_einheit || '-' || lpad(v_n::text, 2, '0');
    exit when not exists (select 1 from sepa_mandates where building_id = p_building and mandatsreferenz = v_ref);
    v_n := v_n + 1;
  end loop;
  return v_ref;
end;
$$;
grant execute on function public.neue_mandatsreferenz(uuid, text) to authenticated;

-- Bestehende Mandatsangaben aus den Bankverbindungen übernehmen
insert into public.sepa_mandates (building_id, assignment_id, contact_id, mandatsreferenz, kontoinhaber, iban, bic, unterschrieben_am, quelle)
select a.building_id, a.id, a.contact_id,
       coalesce(nullif(trim(cba.sepa_mandate_ref), ''), public.neue_mandatsreferenz(a.building_id, a.unit_number)),
       coalesce(a.iban_holder_override, cba.account_holder),
       upper(replace(coalesce(a.iban_override, cba.iban), ' ', '')),
       cba.bic,
       cba.sepa_mandate_date,
       'uebernahme'
from public.contact_building_assignments a
join public.contact_bank_accounts cba on cba.id = a.bank_account_id
where a.is_active
  and a.role_in_building = 'eigentuemer'
  and (cba.sepa_mandate_ref is not null or cba.sepa_mandate_date is not null)
  and not exists (select 1 from public.sepa_mandates m where m.assignment_id = a.id)
on conflict do nothing;

-- ── Aufträge ────────────────────────────────────────────────────────────────
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  konto_iban text not null,
  art text not null check (art in ('ueberweisung', 'einzug', 'dauerlastschrift')),
  betragsquelle text not null default 'fest' check (betragsquelle in ('fest', 'abrechnung', 'wirtschaftsplan')),
  titel text not null,
  verwendungszweck text,
  rhythmus text check (rhythmus in ('monatlich', 'quartal', 'halbjahr', 'jahr')),
  faellig_am date,                -- Einmal-Auftrag: Ausführung / Einzug am
  naechste_faelligkeit date,      -- Dauerlastschrift: nächster Einzug
  ende_am date,
  status text not null default 'aktiv' check (status in ('aktiv', 'pausiert', 'erledigt', 'abgebrochen')),
  billing_period_id uuid references public.billing_periods(id) on delete set null,
  economic_plan_id uuid references public.economic_plans(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_orders_building_idx on public.payment_orders (building_id, status);

create table if not exists public.payment_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders(id) on delete cascade,
  assignment_id uuid references public.contact_building_assignments(id) on delete set null,
  mandate_id uuid references public.sepa_mandates(id) on delete set null,
  name text not null,
  iban text,
  bic text,
  betrag numeric check (betrag is null or betrag > 0),  -- bei „wirtschaftsplan“ leer: Hausgeld zum Fälligkeitstag
  verwendungszweck text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists payment_order_items_order_idx on public.payment_order_items (order_id);

-- ── Zahlläufe: auch Lastschriften und Aufträge ──────────────────────────────
alter table public.payment_runs
  add column if not exists art text not null default 'ueberweisung',
  add column if not exists order_id uuid references public.payment_orders(id) on delete set null,
  add column if not exists faellig_am date,
  add column if not exists glaeubiger_id text;
alter table public.payment_runs drop constraint if exists payment_runs_art_check;
alter table public.payment_runs add constraint payment_runs_art_check check (art in ('ueberweisung', 'lastschrift'));

alter table public.payment_run_items
  add column if not exists order_item_id uuid references public.payment_order_items(id) on delete set null,
  add column if not exists mandate_id uuid references public.sepa_mandates(id) on delete set null,
  add column if not exists mandatsreferenz text,
  add column if not exists mandat_datum date;

-- Lastschrift gutgeschrieben → Position erledigt, Mandat „zuletzt genutzt“
create or replace function public.zahllauf_einzug_zuordnen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  if new.amount <= 0 or new.debtor_iban is null then
    return new;
  end if;

  select i.id, i.run_id, i.mandate_id into v_item
  from public.payment_run_items i
  join public.payment_runs r on r.id = i.run_id
  where i.bank_transaction_id is null
    and r.art = 'lastschrift'
    and r.status in ('gesendet', 'unklar')
    and r.building_id = new.building_id
    and upper(replace(i.iban, ' ', '')) = upper(replace(new.debtor_iban, ' ', ''))
    and abs(i.betrag - new.amount) < 0.005
  order by (new.end_to_end_ref is not null and i.end_to_end_id = new.end_to_end_ref) desc, r.created_at
  limit 1;

  if v_item.id is null then
    return new;
  end if;

  update public.payment_run_items set bank_transaction_id = new.id, bezahlt_am = new.booking_date where id = v_item.id;
  if v_item.mandate_id is not null then
    update public.sepa_mandates set zuletzt_genutzt = new.booking_date where id = v_item.mandate_id;
  end if;
  update public.payment_runs r
     set status = 'ausgefuehrt', updated_at = now()
   where r.id = v_item.run_id
     and not exists (select 1 from public.payment_run_items i where i.run_id = r.id and i.bank_transaction_id is null);
  return new;
end;
$$;

drop trigger if exists bank_transactions_einzug_zuordnen on public.bank_transactions;
create trigger bank_transactions_einzug_zuordnen
  after insert on public.bank_transactions
  for each row execute function public.zahllauf_einzug_zuordnen();
revoke all on function public.zahllauf_einzug_zuordnen() from public, anon, authenticated;

-- ── Rechte ──────────────────────────────────────────────────────────────────
alter table public.sepa_mandates enable row level security;
alter table public.payment_orders enable row level security;
alter table public.payment_order_items enable row level security;

create policy sepa_mandates_verwaltung on public.sepa_mandates for all to authenticated
  using (public.user_has_admin_access(auth.uid())) with check (public.user_has_admin_access(auth.uid()));
create policy payment_orders_verwaltung on public.payment_orders for all to authenticated
  using (public.user_has_admin_access(auth.uid())) with check (public.user_has_admin_access(auth.uid()));
create policy payment_order_items_verwaltung on public.payment_order_items for all to authenticated
  using (public.user_has_admin_access(auth.uid())) with check (public.user_has_admin_access(auth.uid()));

revoke all on public.sepa_mandates, public.payment_orders, public.payment_order_items from anon;
grant select, insert, update, delete on public.sepa_mandates, public.payment_orders, public.payment_order_items to authenticated;

-- Dokumente der Mandate (privat, nur Verwaltung)
insert into storage.buckets (id, name, public) values ('sepa-mandates', 'sepa-mandates', false) on conflict (id) do nothing;
create policy sepa_mandates_dateien on storage.objects for all to authenticated
  using (bucket_id = 'sepa-mandates' and public.user_has_admin_access(auth.uid()))
  with check (bucket_id = 'sepa-mandates' and public.user_has_admin_access(auth.uid()));
