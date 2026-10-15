-- Mandate aus Fragebogen und Import (15.10.2026)
-- status 'pruefen': Vorschlag (z. B. aus dem Eigentümer-Fragebogen), wird erst
-- nach Freigabe durch die Verwaltung 'aktiv' und damit für Einzüge genutzt.
alter table public.sepa_mandates drop constraint if exists sepa_mandates_status_check;
alter table public.sepa_mandates add constraint sepa_mandates_status_check
  check (status in ('aktiv', 'pruefen', 'widerrufen', 'ersetzt', 'verworfen'));
alter table public.sepa_mandates drop constraint if exists sepa_mandates_quelle_check;
alter table public.sepa_mandates add constraint sepa_mandates_quelle_check
  check (quelle in ('buero', 'eigentuemer', 'scan', 'uebernahme', 'fragebogen', 'import'));

-- Vorschlag aus dem Fragebogen: je Eigentümer-Einheit des Kontakts in der Liegenschaft
create or replace function public.mandat_vorschlag_anlegen(
  p_contact uuid, p_building uuid, p_iban text, p_inhaber text, p_datum date, p_notiz text default null
) returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
  v_iban text := upper(replace(coalesce(p_iban, ''), ' ', ''));
  n int := 0;
begin
  if length(v_iban) < 15 then return 0; end if;
  for a in
    select id, building_id, unit_number from public.contact_building_assignments
    where contact_id = p_contact and role_in_building = 'eigentuemer' and coalesce(is_active, true)
      and (p_building is null or building_id = p_building)
  loop
    -- schon ein aktives Mandat oder ein offener Vorschlag mit dieser IBAN? dann nichts tun
    if exists (select 1 from public.sepa_mandates m where m.assignment_id = a.id and m.status in ('aktiv', 'pruefen')
               and upper(replace(coalesce(m.iban, ''), ' ', '')) = v_iban) then
      continue;
    end if;
    -- älteren offenen Vorschlag mit anderer IBAN ersetzen
    update public.sepa_mandates set status = 'ersetzt', updated_at = now() where assignment_id = a.id and status = 'pruefen';
    insert into public.sepa_mandates (building_id, assignment_id, contact_id, mandatsreferenz, kontoinhaber, iban, unterschrieben_am, quelle, status, notiz)
    values (a.building_id, a.id, p_contact, public.neue_mandatsreferenz(a.building_id, a.unit_number), nullif(trim(p_inhaber), ''), v_iban, p_datum, 'fragebogen', 'pruefen', p_notiz);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.mandat_vorschlag_anlegen(uuid, uuid, text, text, date, text) from public, anon, authenticated;
grant execute on function public.mandat_vorschlag_anlegen(uuid, uuid, text, text, date, text) to service_role;
