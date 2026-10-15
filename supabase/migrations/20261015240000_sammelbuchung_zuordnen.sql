-- Sammelbuchung der Bank einem Zahlungsauftrag zuordnen (15.10.2026)
-- Die Bank bucht eine Sammelüberweisung/-lastschrift oft als EINE Zeile
-- („SEPA Sammel-Ueberweisung mit 3 Ueberweisungen") ohne Gegen-IBAN.
-- Passt Betrag, Konto und Zeitraum eindeutig zu einem gesendeten Auftrag,
-- gelten alle Posten als ausgeführt und die Rechnungen als bezahlt.

create or replace function public.sammelbuchung_zuordnen(p_txn uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  v_konto text;
  v_art text;
  v_runs uuid[];
  v_run uuid;
begin
  select * into t from public.bank_transactions where id = p_txn;
  if t.id is null then return null; end if;
  -- Einzelbuchungen (mit Gegen-IBAN) ordnen die anderen Trigger zu
  if t.amount < 0 and t.creditor_iban is null then v_art := 'ueberweisung';
  elsif t.amount > 0 and t.debtor_iban is null then v_art := 'lastschrift';
  else return null; end if;

  select upper(replace(s.account_iban, ' ', '')) into v_konto from public.bank_statements s where s.id = t.statement_id;
  if v_konto is null then
    v_konto := upper(replace(coalesce(case when t.amount < 0 then t.debtor_iban else t.creditor_iban end, ''), ' ', ''));
  end if;

  select array_agg(r.id) into v_runs
  from public.payment_runs r
  where r.art = v_art
    and r.status in ('datei', 'gesendet', 'unklar')
    and (r.building_id = t.building_id or t.building_id is null)
    and upper(replace(r.konto_iban, ' ', '')) = v_konto
    and abs(r.summe - abs(t.amount)) < 0.005
    and r.created_at::date <= t.booking_date + 1
    and r.created_at::date >= t.booking_date - 30
    and not exists (select 1 from public.payment_run_items i where i.run_id = r.id and i.bank_transaction_id is not null);
  -- nur bei genau einem passenden Auftrag
  if coalesce(array_length(v_runs, 1), 0) <> 1 then return null; end if;
  v_run := v_runs[1];

  update public.payment_run_items set bank_transaction_id = t.id, bezahlt_am = t.booking_date where run_id = v_run;
  update public.invoices v set status = 'paid', paid_at = coalesce(t.booking_date::timestamptz, now())
   where v.status <> 'paid' and v.id in (select invoice_id from public.payment_run_items where run_id = v_run and invoice_id is not null);
  update public.sepa_mandates m set zuletzt_genutzt = t.booking_date
   where m.id in (select mandate_id from public.payment_run_items where run_id = v_run and mandate_id is not null);
  update public.payment_runs set status = 'ausgefuehrt', updated_at = now() where id = v_run;
  return v_run;
end;
$$;

create or replace function public.zahllauf_sammelbuchung_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.sammelbuchung_zuordnen(new.id);
  return new;
end;
$$;

drop trigger if exists bank_transactions_sammelbuchung_zuordnen on public.bank_transactions;
create trigger bank_transactions_sammelbuchung_zuordnen
  after insert on public.bank_transactions
  for each row execute function public.zahllauf_sammelbuchung_trigger();

revoke all on function public.sammelbuchung_zuordnen(uuid) from public, anon;
grant execute on function public.sammelbuchung_zuordnen(uuid) to authenticated;

-- Die Sammelüberweisung vom 15.10.2026 (Birkenweg 13) wurde einmalig mit
-- select public.sammelbuchung_zuordnen('6e92260d-973a-4f52-9f73-ac78ba461546') zugeordnet.
