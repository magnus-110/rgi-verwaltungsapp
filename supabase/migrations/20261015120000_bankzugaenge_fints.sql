-- Bankzugänge über FinTS (Phase 2 Bank-Automatisierung, 15.10.2026)
--
-- Ein Bankzugang = ein Online-Banking-Login bei einer Bank. Darüber holt
-- die Edge-Funktion "fints" zweimal täglich die Umsätze aller Konten ab,
-- die einer Liegenschaft zugeordnet sind (building_bank_accounts).
--
-- Die Bank-PIN liegt verschlüsselt im Supabase Vault. In der Tabelle
-- steht nur die ID des Vault-Eintrags; lesen kann die PIN ausschließlich
-- die Edge-Funktion (service_role) über fints_pin_holen().

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  blz text not null,
  bank_name text not null,
  fints_url text not null,
  anmeldename text not null,
  kunden_id text,
  pin_secret_id uuid,
  tan_method_id integer,
  tan_method_name text,
  tan_media_name text,
  banking_information jsonb,
  konten jsonb not null default '[]'::jsonb,
  status text not null default 'neu'
    check (status in ('neu', 'aktiv', 'tan_noetig', 'fehler')),
  status_text text,
  sca_bis timestamptz,
  letzter_abruf timestamptz,
  letzter_abruf_ok boolean,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bank_connections is
  'Online-Banking-Zugänge (FinTS) für den automatischen Abruf. PIN nur im Vault (pin_secret_id).';
comment on column public.bank_connections.sca_bis is
  'Bis wann die letzte Bestätigung per TAN gilt (PSD2: 90 Tage für Kontoinformationen).';

create table if not exists public.bank_fetch_log (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  ausloeser text not null check (ausloeser in ('zeitplan', 'hand', 'einrichtung')),
  gestartet timestamptz not null default now(),
  beendet timestamptz,
  ok boolean,
  ergebnis jsonb,
  fehler text,
  user_id uuid references auth.users(id) on delete set null
);
create index if not exists bank_fetch_log_connection_idx on public.bank_fetch_log (connection_id, gestartet desc);

comment on table public.bank_fetch_log is 'Protokoll jedes Abrufs über einen Bankzugang.';

-- Kontostand laut Bank (Abruf), unabhängig von Auszügen
alter table public.building_bank_accounts
  add column if not exists saldo_bank numeric,
  add column if not exists saldo_bank_am timestamptz,
  add column if not exists bank_connection_id uuid references public.bank_connections(id) on delete set null;

-- Auszüge können jetzt auch aus dem Abruf über die Bank kommen
alter table public.bank_statements drop constraint if exists bank_statements_source_format_check;
alter table public.bank_statements
  add constraint bank_statements_source_format_check
  check (source_format = any (array['camt_xml'::text, 'pdf'::text, 'fints'::text]));

-- Aufgaben aus dem Bankabruf (z. B. „Bankzugang mit TAN bestätigen")
alter table public.todos drop constraint if exists todos_source_type_check;
alter table public.todos
  add constraint todos_source_type_check
  check (source_type = any (array['manual'::text, 'maintenance'::text, 'annual_cycle'::text, 'case'::text,
    'dunning'::text, 'meeting'::text, 'report'::text, 'bank'::text]));

-- RLS: nur Admins sehen Bankzugänge und das Protokoll; geschrieben wird
-- ausschließlich über die Edge-Funktion (service_role).
alter table public.bank_connections enable row level security;
alter table public.bank_fetch_log enable row level security;

drop policy if exists bank_connections_admin_lesen on public.bank_connections;
create policy bank_connections_admin_lesen on public.bank_connections
  for select to authenticated using (public.rgi_is_admin(auth.uid()));

drop policy if exists bank_fetch_log_admin_lesen on public.bank_fetch_log;
create policy bank_fetch_log_admin_lesen on public.bank_fetch_log
  for select to authenticated using (public.rgi_is_admin(auth.uid()));

revoke all on public.bank_connections from anon;
revoke all on public.bank_fetch_log from anon;
grant select on public.bank_connections to authenticated;
grant select on public.bank_fetch_log to authenticated;

-- ── PIN im Vault ────────────────────────────────────────────────────────

create or replace function public.fints_pin_setzen(p_connection uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  select pin_secret_id into v_secret from public.bank_connections where id = p_connection;
  if v_secret is null then
    v_secret := vault.create_secret(p_pin, 'fints_pin_' || p_connection::text, 'FinTS-PIN Bankzugang');
    update public.bank_connections set pin_secret_id = v_secret, updated_at = now() where id = p_connection;
  else
    perform vault.update_secret(v_secret, p_pin);
    update public.bank_connections set updated_at = now() where id = p_connection;
  end if;
end;
$$;

create or replace function public.fints_pin_holen(p_connection uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select ds.decrypted_secret
  from public.bank_connections c
  join vault.decrypted_secrets ds on ds.id = c.pin_secret_id
  where c.id = p_connection;
$$;

-- Vault-Eintrag mitlöschen, wenn ein Bankzugang entfernt wird
create or replace function public.bank_connections_pin_loeschen()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if old.pin_secret_id is not null then
    delete from vault.secrets where id = old.pin_secret_id;
  end if;
  return old;
end;
$$;

drop trigger if exists bank_connections_pin_loeschen on public.bank_connections;
create trigger bank_connections_pin_loeschen
  after delete on public.bank_connections
  for each row execute function public.bank_connections_pin_loeschen();

-- Schlüssel, mit dem der Zeitplan (pg_cron) die Funktion aufrufen darf
create or replace function public.fints_cron_token_pruefen(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'fints_cron_token' and decrypted_secret = p_token
  );
$$;

revoke all on function public.fints_pin_setzen(uuid, text) from public, anon, authenticated;
revoke all on function public.fints_pin_holen(uuid) from public, anon, authenticated;
revoke all on function public.fints_cron_token_pruefen(text) from public, anon, authenticated;
revoke all on function public.bank_connections_pin_loeschen() from public, anon, authenticated;
grant execute on function public.fints_pin_setzen(uuid, text) to service_role;
grant execute on function public.fints_pin_holen(uuid) to service_role;
grant execute on function public.fints_cron_token_pruefen(text) to service_role;

-- ── Konten-Übersicht: Saldo laut Bank bevorzugen, wenn neuer ─────────────

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
  case
    when bba.saldo_bank is not null and (ls.statement_date_to is null or bba.saldo_bank_am::date >= ls.statement_date_to)
      then bba.saldo_bank
    else ls.closing_balance
  end as saldo,
  case
    when bba.saldo_bank is not null and (ls.statement_date_to is null or bba.saldo_bank_am::date >= ls.statement_date_to)
      then bba.saldo_bank_am::date
    else ls.statement_date_to
  end as saldo_stand,
  la.import_date as letzter_import,
  la.source_format as letzte_quelle,
  coalesce(bw.offen, 0)::int as offen,
  coalesce(bw.gesamt, 0)::int as bewegungen,
  bw.letzte_bewegung,
  bba.bank_connection_id,
  bba.saldo_bank_am
from konten k
left join public.building_bank_accounts bba
  on bba.building_id = k.building_id and upper(replace(bba.iban, ' ', '')) = k.iban
left join letzter_saldo ls on ls.building_id = k.building_id and ls.iban = k.iban
left join letzter_auszug la on la.building_id = k.building_id and la.iban = k.iban
left join bewegungen bw on bw.building_id = k.building_id and bw.iban = k.iban;

grant select on public.v_konten_uebersicht to authenticated;

-- Schlüssel für den Zeitplan einmalig zufällig erzeugen (bleibt im Vault)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fints_cron_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'fints_cron_token',
      'Schlüssel für den Zeitplan der FinTS-Abrufe'
    );
  end if;
end $$;

-- Zeitplan: 06:00 und 13:00 Uhr deutscher Zeit (pg_cron läuft in UTC,
-- deshalb vier Zeitpunkte und die Stunde in Berlin als Bedingung).
select cron.schedule('fints-abruf', '2 4,5,11,12 * * *', $cmd$
select net.http_post(
  url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/fints',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := jsonb_build_object('aktion', 'zeitplan', 'token', (select decrypted_secret from vault.decrypted_secrets where name = 'fints_cron_token')),
  timeout_milliseconds := 300000
)
where extract(hour from now() at time zone 'Europe/Berlin') in (6, 13);
$cmd$);
