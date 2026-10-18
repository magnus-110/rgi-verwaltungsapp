-- Abgeschlossene Interessenten können ausgeblendet werden (bleiben gespeichert).
alter table public.broker_leads add column if not exists archived_at timestamptz;

-- Altbestand (vor dem Start des Maklerbereichs) einmalig abschließen.
update public.broker_leads
   set status = 'absage',
       outcome_reason = coalesce(outcome_reason, 'Ältere Anfrage – beim Start der App abgeschlossen')
 where status not in ('abschluss', 'absage');
