-- Einmaliger Abgleich der Eigentümer mit den bisherigen Hausgeld-Einzügen (15.10.2026)
-- Je Eigentümer-Einheit aus den Kontoauszügen (letzte 24 Monate):
--   * Hausgeld = letzter regulärer Einzug („mtl. …"), gültig ab Beginn dieses Betrags
--   * Bankverbindung = IBAN der neuesten Zahlung
--   * Mandat = bisherige Mandatsreferenz (MREF), Datum aus der Referenz, letzter Einzug;
--     ohne bisherige Referenz: neue Referenz (Vorschlag aus dem Fragebogen wird aktiv)
-- p_anwenden = false liefert nur die Vorschau. Ausnahmen: p_ausnahmen (assignment_ids).
create or replace function public.hg_einzuege(p_building uuid, p_einheit text)
returns table (d date, betrag numeric, iban text, ref text, regulaer bool, zahler text)
language sql stable security definer set search_path to 'public'
as $f$
  select t.booking_date, t.amount,
         upper(replace(coalesce(t.debtor_iban, (regexp_match(t.purpose, 'IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9]+)'))[1]), ' ', '')),
         (regexp_match(t.purpose, 'MREF:\s*(E\d+-\d+-\d+)'))[1], t.purpose ~* '(mtl|monatl)', t.debtor_name
  from bank_transactions t
  where t.building_id = p_building and t.amount > 0 and t.booking_date >= current_date - 730
    and ltrim((regexp_match(t.purpose, 'MREF:\s*E\d+-(\d+)-'))[1], '0') = p_einheit
$f$;
revoke all on function public.hg_einzuege(uuid, text) from public, anon, authenticated;

create or replace function public.hausgeld_abgleich(p_anwenden boolean default false, p_ausnahmen uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o record;
  v_betrag numeric; v_mehrfach int; v_start date; v_ref text; v_ref_datum date; v_zuletzt date;
  v_iban text; v_inhaber text; v_konto uuid; v_mandat record; v_vorschlag record; v_akt record;
  n_hg int := 0; n_bank int := 0; n_mandat_ref int := 0; n_mandat_neu int := 0; n_vorschlag int := 0;
  liste_hg jsonb := '[]'; liste_bank jsonb := '[]'; offen jsonb := '[]';
begin
  for o in
    select a.id, a.building_id, b.name haus, a.unit_number, ltrim(a.unit_number, '0') einheit, a.contact_id, a.bank_account_id, a.iban_override,
           coalesce(c.company_name, nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), 'Eigentümer') name,
           coalesce(c.last_name, '') ln,
           array(select upper(replace(x.iban, ' ', '')) from contact_bank_accounts x where x.contact_id = a.contact_id and x.iban is not null) ibans,
           upper(replace(coalesce(a.iban_override, k.iban, (select x.iban from contact_bank_accounts x where x.contact_id = a.contact_id order by x.is_default desc, x.updated_at desc limit 1)), ' ', '')) iban_jetzt
    from contact_building_assignments a
    join buildings b on b.id = a.building_id
    left join contacts c on c.id = a.contact_id
    left join contact_bank_accounts k on k.id = a.bank_account_id
    where a.role_in_building = 'eigentuemer' and coalesce(a.is_active, true) and coalesce(b.management_mode, 'weg') = 'weg'
    order by b.name, a.unit_number
  loop
    select ref, d into v_ref, v_zuletzt from hg_einzuege(o.building_id, o.einheit) where ref is not null order by d desc limit 1;
    v_ref_datum := case when v_ref ~ '-\d{8}$' then to_date(right(v_ref, 8), 'DDMMYYYY') else null end;

    -- Hausgeld: letzter Monat mit regulärem Einzug; zwei Einzüge im selben Monat = unklar
    v_betrag := null; v_start := null;
    select count(*), max(betrag) into v_mehrfach, v_betrag from hg_einzuege(o.building_id, o.einheit)
      where regulaer and date_trunc('month', d) = (select date_trunc('month', max(d)) from hg_einzuege(o.building_id, o.einheit) where regulaer);
    if v_mehrfach > 1 then
      offen := offen || jsonb_build_object('haus', o.haus, 'einheit', o.unit_number, 'name', o.name, 'grund', 'mehrere Einzüge pro Monat unter einer Mandatsreferenz');
      v_betrag := null;
    end if;
    if v_betrag is not null then
      select date_trunc('month', min(d))::date into v_start from hg_einzuege(o.building_id, o.einheit)
        where regulaer and betrag = v_betrag
          and d > coalesce((select max(d) from hg_einzuege(o.building_id, o.einheit) where regulaer and betrag <> v_betrag), '1900-01-01');
    end if;

    -- neueste IBAN: Einzüge, sonst Zahlungen von bekannter IBAN, sonst eindeutiger Name
    v_iban := (select iban from hg_einzuege(o.building_id, o.einheit) where iban is not null order by d desc limit 1);
    v_inhaber := (select zahler from hg_einzuege(o.building_id, o.einheit) where iban is not null order by d desc limit 1);
    if v_iban is null then
      select upper(replace(coalesce(t.debtor_iban, (regexp_match(t.purpose, 'IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9]+)'))[1]), ' ', '')), t.debtor_name into v_iban, v_inhaber
      from bank_transactions t
      where t.building_id = o.building_id and t.amount > 0 and t.booking_date >= current_date - 730
        and (upper(replace(coalesce(t.debtor_iban, ''), ' ', '')) = any(o.ibans)
             or (length(o.ln) >= 4 and lower(t.debtor_name) like '%' || lower(o.ln) || '%'
                 and not exists (select 1 from contact_building_assignments a2 join contacts c2 on c2.id = a2.contact_id
                                 where a2.building_id = o.building_id and a2.role_in_building = 'eigentuemer' and a2.contact_id <> o.contact_id and c2.last_name = o.ln)))
        and coalesce(t.debtor_iban, (regexp_match(t.purpose, 'IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9]+)'))[1]) is not null
      order by t.booking_date desc limit 1;
    end if;
    if v_inhaber is not null and v_inhaber = upper(v_inhaber) then v_inhaber := initcap(lower(v_inhaber)); end if;

    -- 1) Hausgeld
    select coalesce(sum(cc.amount), 0) total, max(cc.reserve_share_monthly) reserve into v_akt
      from contact_building_costs cc
      where cc.assignment_id = o.id and cc.cost_type = 'Hausgeld' and (cc.valid_from is null or cc.valid_from <= current_date) and (cc.valid_to is null or cc.valid_to >= current_date);
    if v_betrag is not null and abs(v_akt.total - v_betrag) > 0.005 then
      n_hg := n_hg + 1;
      liste_hg := liste_hg || jsonb_build_object('haus', o.haus, 'einheit', o.unit_number, 'name', o.name, 'bisher', v_akt.total, 'neu', v_betrag, 'ab', v_start);
      if p_anwenden then
        update contact_building_costs set valid_to = v_start - 1, updated_at = now()
          where assignment_id = o.id and cost_type = 'Hausgeld' and (valid_to is null or valid_to >= v_start) and coalesce(valid_from, '1900-01-01') < v_start;
        if exists (select 1 from contact_building_costs where assignment_id = o.id and cost_type = 'Hausgeld' and valid_from >= v_start) then
          update contact_building_costs set amount = v_betrag, updated_at = now()
            where id = (select id from contact_building_costs where assignment_id = o.id and cost_type = 'Hausgeld' and valid_from >= v_start order by valid_from limit 1);
        else
          insert into contact_building_costs (assignment_id, cost_type, amount, interval, valid_from, reserve_share_monthly)
          values (o.id, 'Hausgeld', v_betrag, 'monatlich', v_start, coalesce(v_akt.reserve, 0));
        end if;
      end if;
    end if;

    -- 2) Bankverbindung
    if v_iban is not null and v_iban is distinct from o.iban_jetzt and not (o.id = any(p_ausnahmen)) then
      n_bank := n_bank + 1;
      liste_bank := liste_bank || jsonb_build_object('haus', o.haus, 'einheit', o.unit_number, 'name', o.name, 'bisher', o.iban_jetzt, 'neu', v_iban);
      if p_anwenden then
        select id into v_konto from contact_bank_accounts where contact_id = o.contact_id and upper(replace(iban, ' ', '')) = v_iban limit 1;
        if v_konto is null then
          insert into contact_bank_accounts (contact_id, iban, account_holder, is_default)
          values (o.contact_id, v_iban, coalesce(v_inhaber, o.name), not exists (select 1 from contact_bank_accounts where contact_id = o.contact_id))
          returning id into v_konto;
        end if;
        update contact_building_assignments set bank_account_id = v_konto, iban_override = null where id = o.id;
        -- nur eine Einheit: auch als Standardkonto des Kontakts
        if (select count(*) from contact_building_assignments where contact_id = o.contact_id and coalesce(is_active, true)) = 1 then
          update contact_bank_accounts set is_default = (id = v_konto) where contact_id = o.contact_id;
        end if;
      end if;
    end if;
    if o.id = any(p_ausnahmen) then v_iban := o.iban_jetzt; end if;

    -- 3) Mandat
    select * into v_mandat from sepa_mandates where assignment_id = o.id and status = 'aktiv' limit 1;
    select * into v_vorschlag from sepa_mandates where assignment_id = o.id and status = 'pruefen' limit 1;
    if v_ref is not null then
      if v_mandat.id is not null and v_mandat.mandatsreferenz = v_ref then
        if p_anwenden then
          update sepa_mandates set iban = coalesce(v_iban, iban), zuletzt_genutzt = greatest(coalesce(zuletzt_genutzt, v_zuletzt), v_zuletzt),
                 unterschrieben_am = coalesce(unterschrieben_am, v_ref_datum), updated_at = now() where id = v_mandat.id;
        end if;
      else
        n_mandat_ref := n_mandat_ref + 1;
        if p_anwenden then
          if v_mandat.id is not null then update sepa_mandates set status = 'ersetzt', updated_at = now() where id = v_mandat.id; end if;
          if v_vorschlag.id is not null then update sepa_mandates set status = 'verworfen', updated_at = now() where id = v_vorschlag.id; end if;
          insert into sepa_mandates (building_id, assignment_id, contact_id, mandatsreferenz, kontoinhaber, iban, unterschrieben_am, zuletzt_genutzt, quelle, status, notiz)
          values (o.building_id, o.id, o.contact_id, v_ref, coalesce(v_inhaber, o.name), coalesce(v_iban, o.iban_jetzt), v_ref_datum, v_zuletzt, 'import', 'aktiv',
                  'Aus den bisherigen Einzügen übernommen (Datum aus der Mandatsreferenz)')
          on conflict (building_id, mandatsreferenz) do nothing;
        end if;
      end if;
    elsif v_mandat.id is null then
      if v_vorschlag.id is not null then
        n_vorschlag := n_vorschlag + 1;
        if p_anwenden then update sepa_mandates set status = 'aktiv', updated_at = now() where id = v_vorschlag.id; end if;
      elsif coalesce(v_iban, o.iban_jetzt) is not null then
        n_mandat_neu := n_mandat_neu + 1;
        if p_anwenden then
          insert into sepa_mandates (building_id, assignment_id, contact_id, mandatsreferenz, kontoinhaber, iban, quelle, status, notiz)
          values (o.building_id, o.id, o.contact_id, neue_mandatsreferenz(o.building_id, o.unit_number), coalesce(v_inhaber, o.name), coalesce(v_iban, o.iban_jetzt), 'buero', 'aktiv',
                  'Neue Mandatsreferenz beim Abgleich vergeben – Unterschriftsdatum ergänzen');
        end if;
      else
        offen := offen || jsonb_build_object('haus', o.haus, 'einheit', o.unit_number, 'name', o.name, 'grund', 'keine IBAN bekannt – kein Mandat angelegt');
      end if;
    end if;
  end loop;

  return jsonb_build_object('angewendet', p_anwenden, 'hausgeld_geaendert', n_hg, 'bank_geaendert', n_bank,
    'mandate_aus_referenz', n_mandat_ref, 'mandate_neu', n_mandat_neu, 'vorschlaege_aktiviert', n_vorschlag,
    'hausgeld', liste_hg, 'bank', liste_bank, 'offen', offen);
end;
$$;
revoke all on function public.hausgeld_abgleich(boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.hausgeld_abgleich(boolean, uuid[]) to service_role;
