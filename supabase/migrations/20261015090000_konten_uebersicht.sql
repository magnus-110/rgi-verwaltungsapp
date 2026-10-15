-- Konten-Seite (Phase 1 Bank-Automatisierung, 15.10.2026)
--
-- Eine Zeile je Liegenschaft und Bankkonto (IBAN): Kontostand laut letztem
-- Auszug mit Saldo, Stand-Datum, Zahl der noch nicht gebuchten Bewegungen.
-- Konten kommen aus building_bank_accounts und – falls dort (noch) nicht
-- hinterlegt – aus den eingelesenen Auszügen.
--
-- security_invoker: die View sieht nur, was die aufrufende Person über die
-- RLS der Grundtabellen sehen darf.

create or replace view public.v_konten_uebersicht
with (security_invoker = true) as
with stmt as (
  select
    s.id,
    s.building_id,
    upper(replace(s.account_iban, ' ', '')) as iban,
    s.account_name,
    s.closing_balance,
    s.statement_date_to,
    s.source_format,
    s.import_date
  from public.bank_statements s
  where s.account_iban is not null
),
konten as (
  select b.building_id, upper(replace(b.iban, ' ', '')) as iban
  from public.building_bank_accounts b
  where coalesce(b.is_active, true)
  union
  select building_id, iban from stmt where building_id is not null
),
letzter_saldo as (
  select distinct on (building_id, iban)
    building_id, iban, closing_balance, statement_date_to
  from stmt
  where closing_balance is not null
  order by building_id, iban, statement_date_to desc nulls last, import_date desc
),
letzter_auszug as (
  select distinct on (building_id, iban)
    building_id, iban, account_name, source_format, import_date, statement_date_to
  from stmt
  order by building_id, iban, import_date desc
),
bewegungen as (
  select
    st.building_id,
    st.iban,
    count(*) filter (where t.booked_at is null and t.match_status <> 'ignored') as offen,
    count(*) as gesamt,
    max(t.booking_date) as letzte_bewegung
  from public.bank_transactions t
  join stmt st on st.id = t.statement_id
  group by st.building_id, st.iban
)
select
  k.building_id,
  k.iban,
  bba.id as bank_account_id,
  bba.display_name,
  coalesce(bba.bank_name, la.account_name) as bank_name,
  bba.coa_account_id,
  ls.closing_balance as saldo,
  ls.statement_date_to as saldo_stand,
  la.import_date as letzter_import,
  la.source_format as letzte_quelle,
  coalesce(bw.offen, 0)::int as offen,
  coalesce(bw.gesamt, 0)::int as bewegungen,
  bw.letzte_bewegung
from konten k
left join public.building_bank_accounts bba
  on bba.building_id = k.building_id and upper(replace(bba.iban, ' ', '')) = k.iban
left join letzter_saldo ls on ls.building_id = k.building_id and ls.iban = k.iban
left join letzter_auszug la on la.building_id = k.building_id and la.iban = k.iban
left join bewegungen bw on bw.building_id = k.building_id and bw.iban = k.iban;

grant select on public.v_konten_uebersicht to authenticated;

comment on view public.v_konten_uebersicht is
  'Konten-Seite: je Liegenschaft und IBAN Saldo laut letztem Auszug, Stand und Zahl der noch nicht gebuchten Bewegungen.';
