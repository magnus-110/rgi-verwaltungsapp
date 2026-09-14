-- Korrektur zu 20260914140000: In der ersten Fassung wurden die Feldnamen mit
-- "felder := felder || 'account_id'" angehaengt. PL/pgSQL liest den blossen String
-- dabei als Array-Literal und bricht mit "malformed array literal" ab - wodurch
-- JEDES Update auf bookings fehlgeschlagen waere. array_append haengt das Element an.

create or replace function public.log_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;
