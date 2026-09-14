-- Aenderungshistorie fuer Buchungen.
--
-- Zweck: auswerten koennen, welche Buchungen nachtraeglich korrigiert werden mussten
-- und welches Muster dahintersteckt - in aller Regel eine falsche Kontierung. Bisher
-- gab es fuer bookings keinerlei Protokoll: nach einer Aenderung war der vorherige
-- Stand unwiederbringlich weg.
--
-- Bewusst als Datenbank-Trigger und nicht in der Anwendung: Gebucht und korrigiert
-- wird ueber die App, ueber Lovable und direkt per SQL. Nur ein Trigger erfasst
-- alle drei Wege.

create table if not exists public.booking_change_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  building_id uuid,
  changed_at timestamptz not null default now(),
  -- Bei Aenderungen ueber die App der angemeldete Nutzer; bei direkten SQL-Aenderungen
  -- mit Service-Role null. changed_via haelt die Datenbankrolle fest und zeigt damit,
  -- auf welchem Weg korrigiert wurde.
  changed_by uuid,
  changed_via text,
  change_type text not null check (change_type in ('update', 'delete')),
  -- Welche Felder sich geaendert haben. Der Kern der spaeteren Musterauswertung.
  changed_fields text[] not null default '{}',
  -- Kontowechsel und Betrag zusaetzlich ausgelagert, damit Auswertungen ohne
  -- JSONB-Zugriffe auskommen.
  account_id_before uuid,
  account_id_after uuid,
  amount_before numeric,
  amount_after numeric,
  old_values jsonb,
  new_values jsonb
);

create index if not exists idx_booking_change_log_booking on public.booking_change_log (booking_id);
create index if not exists idx_booking_change_log_zeit on public.booking_change_log (changed_at desc);
create index if not exists idx_booking_change_log_konto on public.booking_change_log (account_id_before, account_id_after)
  where account_id_before is distinct from account_id_after;

alter table public.booking_change_log enable row level security;

create policy "Admins und Mitarbeiter lesen die Buchungshistorie"
  on public.booking_change_log
  for select
  using (user_has_admin_access(auth.uid()));

comment on table public.booking_change_log is
  'Protokoll nachtraeglicher Aenderungen an Buchungen. Wird ausschliesslich vom Trigger trg_log_booking_change befuellt.';

create or replace function public.log_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  felder text[] := '{}';
  alt jsonb;
  neu jsonb;
begin
  if TG_OP = 'DELETE' then
    insert into public.booking_change_log (
      booking_id, building_id, changed_by, changed_via, change_type,
      account_id_before, amount_before, old_values
    )
    values (
      OLD.id, OLD.building_id, auth.uid(), current_user, 'delete',
      OLD.account_id, OLD.amount, to_jsonb(OLD)
    );
    return OLD;
  end if;

  -- Nur fachlich bedeutsame Felder. Reine Workflow- und Technikspalten
  -- (status, needs_review, match_*, ai_*, updated_at) wuerden das Protokoll
  -- mit Rauschen fuellen und die Auswertung wertlos machen.
  --
  -- array_append und nicht || : Ein blosser String wird sonst als Array-Literal
  -- gelesen und laesst jedes UPDATE auf bookings scheitern.
  if NEW.account_id           is distinct from OLD.account_id           then felder := array_append(felder, 'account_id'); end if;
  if NEW.counter_account_id   is distinct from OLD.counter_account_id   then felder := array_append(felder, 'counter_account_id'); end if;
  if NEW.amount               is distinct from OLD.amount               then felder := array_append(felder, 'amount'); end if;
  if NEW.booking_date         is distinct from OLD.booking_date         then felder := array_append(felder, 'booking_date'); end if;
  if NEW.booking_type         is distinct from OLD.booking_type         then felder := array_append(felder, 'booking_type'); end if;
  if NEW.booking_category     is distinct from OLD.booking_category     then felder := array_append(felder, 'booking_category'); end if;
  if NEW.description          is distinct from OLD.description          then felder := array_append(felder, 'description'); end if;
  if NEW.fiscal_year          is distinct from OLD.fiscal_year          then felder := array_append(felder, 'fiscal_year'); end if;
  if NEW.invoice_id           is distinct from OLD.invoice_id           then felder := array_append(felder, 'invoice_id'); end if;
  if NEW.bank_transaction_id  is distinct from OLD.bank_transaction_id  then felder := array_append(felder, 'bank_transaction_id'); end if;
  if NEW.receipt_number       is distinct from OLD.receipt_number       then felder := array_append(felder, 'receipt_number'); end if;
  if NEW.is_35a_relevant      is distinct from OLD.is_35a_relevant      then felder := array_append(felder, 'is_35a_relevant'); end if;
  if NEW.amount_35a           is distinct from OLD.amount_35a           then felder := array_append(felder, 'amount_35a'); end if;
  if NEW.umlagefaehig         is distinct from OLD.umlagefaehig         then felder := array_append(felder, 'umlagefaehig'); end if;
  if NEW.vat_rate             is distinct from OLD.vat_rate             then felder := array_append(felder, 'vat_rate'); end if;
  if NEW.vat_amount           is distinct from OLD.vat_amount           then felder := array_append(felder, 'vat_amount'); end if;
  if NEW.performance_period_from is distinct from OLD.performance_period_from then felder := array_append(felder, 'performance_period_from'); end if;
  if NEW.performance_period_to   is distinct from OLD.performance_period_to   then felder := array_append(felder, 'performance_period_to'); end if;
  if NEW.split_part           is distinct from OLD.split_part           then felder := array_append(felder, 'split_part'); end if;
  if NEW.split_parts_total    is distinct from OLD.split_parts_total    then felder := array_append(felder, 'split_parts_total'); end if;

  if array_length(felder, 1) is null then
    return NEW;
  end if;

  -- Nur die tatsaechlich geaenderten Felder festhalten - das haelt das Protokoll
  -- lesbar und macht den Unterschied auf einen Blick erkennbar.
  select jsonb_object_agg(key, value) into alt
    from jsonb_each(to_jsonb(OLD)) where key = any(felder);
  select jsonb_object_agg(key, value) into neu
    from jsonb_each(to_jsonb(NEW)) where key = any(felder);

  insert into public.booking_change_log (
    booking_id, building_id, changed_by, changed_via, change_type, changed_fields,
    account_id_before, account_id_after, amount_before, amount_after, old_values, new_values
  )
  values (
    NEW.id, NEW.building_id, auth.uid(), current_user, 'update', felder,
    OLD.account_id, NEW.account_id, OLD.amount, NEW.amount, alt, neu
  );

  return NEW;
end;
$$;

drop trigger if exists trg_log_booking_change on public.bookings;
create trigger trg_log_booking_change
  after update or delete on public.bookings
  for each row execute function public.log_booking_change();
