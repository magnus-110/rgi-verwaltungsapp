-- Phase 3: Überweisung per TAN direkt aus der App (FinTS) und Rechnungen,
-- die per Lastschrift eingezogen werden (15.10.2026)

-- ── Zahlläufe per FinTS ─────────────────────────────────────────────────────
-- pruefung  = wartet auf Versand bzw. Bestätigung der Empfängerüberprüfung
-- laeuft    = wird gerade an die Bank geschickt (Sperre gegen Doppelversand)
-- unklar    = Bank hat weder bestätigt noch abgelehnt (im Online-Banking prüfen)
alter table public.payment_runs drop constraint if exists payment_runs_status_check;
alter table public.payment_runs add constraint payment_runs_status_check
  check (status in ('datei', 'pruefung', 'laeuft', 'gesendet', 'unklar', 'ausgefuehrt', 'abgebrochen', 'fehler'));

alter table public.payment_runs
  add column if not exists connection_id uuid references public.bank_connections(id) on delete set null,
  add column if not exists pain_xml text,
  add column if not exists fehler text,
  add column if not exists gesendet_am timestamptz,
  add column if not exists gesendet_von uuid references auth.users(id) on delete set null;

-- Abbuchung gefunden → Rechnung bezahlt: auch für Läufe per FinTS
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
    and r.status in ('datei', 'gesendet', 'unklar')
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

  update public.payment_runs r
     set status = 'ausgefuehrt', updated_at = now()
   where r.id = v_item.run_id
     and not exists (select 1 from public.payment_run_items i where i.run_id = r.id and i.bank_transaction_id is null);

  return new;
end;
$$;

-- ── Lastschrift ─────────────────────────────────────────────────────────────
-- Rechnungen, deren Betrag der Lieferant selbst einzieht. Sie gehören nicht
-- in die Freigabe; kommt die Abbuchung, ist die Rechnung bezahlt.
alter table public.invoices
  add column if not exists lastschrift boolean not null default false;
comment on column public.invoices.lastschrift is
  'Wird per SEPA-Lastschrift eingezogen – nicht überweisen. Erkennt die KI beim Auslesen, von Hand änderbar.';

create or replace function public.lastschrift_abbuchung_zuordnen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_name text;
begin
  -- nur Abbuchungen, die noch keiner Rechnung zugeordnet sind
  if new.amount >= 0 or new.building_id is null or new.matched_invoice_id is not null then
    return new;
  end if;

  v_name := lower(coalesce(new.creditor_name, ''));

  select array_agg(i.id) into v_ids
  from public.invoices i
  where i.lastschrift
    and i.status = 'open'
    and i.building_id = new.building_id
    and abs(coalesce(i.gross_amount, 0) - abs(new.amount)) < 0.005
    and (
      (i.vendor_iban is not null and new.creditor_iban is not null
        and upper(replace(i.vendor_iban, ' ', '')) = upper(replace(new.creditor_iban, ' ', '')))
      or (i.vendor_name is not null and length(split_part(trim(i.vendor_name), ' ', 1)) >= 4
        and v_name like '%' || lower(split_part(trim(i.vendor_name), ' ', 1)) || '%')
      or (i.invoice_number is not null and length(i.invoice_number) >= 4
        and replace(lower(coalesce(new.purpose, '')), ' ', '') like '%' || replace(lower(i.invoice_number), ' ', '') || '%')
    );

  -- nur bei genau einem Treffer – sonst lieber von Hand
  if v_ids is null or array_length(v_ids, 1) <> 1 then
    return new;
  end if;

  update public.invoices
     set status = 'paid', paid_at = coalesce(new.booking_date::timestamptz, now())
   where id = v_ids[1];

  update public.bank_transactions
     set matched_invoice_id = v_ids[1], match_status = 'matched_invoice'
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists bank_transactions_lastschrift_zuordnen on public.bank_transactions;
create trigger bank_transactions_lastschrift_zuordnen
  after insert on public.bank_transactions
  for each row execute function public.lastschrift_abbuchung_zuordnen();

revoke all on function public.lastschrift_abbuchung_zuordnen() from public, anon, authenticated;
