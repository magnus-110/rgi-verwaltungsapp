-- Dubletten in „Adressen“ zusammenführen: public.kontakte_zusammenfuehren(haupt, dublette, trocken)
--
-- Hängt in EINER Transaktion alles von der Dublette auf den Haupt-Kontakt um und löscht danach die Dublette:
--   * Personen: gleiche Person (gleiche Namensbestandteile, Reihenfolge egal) wird zusammengelegt,
--     sonst als weitere (nicht Haupt-)Person übernommen.
--   * Telefon / E-Mail / Bank: doppelte Werte (normalisiert) werden verworfen; fehlende Notiz/BIC/Bankname ergänzt.
--     Verweise auf verworfene Bankzeilen (Gebäude-Zuordnung, Änderungs-Hinweise) zeigen danach auf die Bankzeile des Haupt-Kontakts.
--   * Alle Fremdschlüssel auf contacts.id (zur Laufzeit aus pg_constraint ermittelt) + comm_recipient_overrides (ohne FK).
--     Eindeutigkeitskonflikte (building_file_visibility, etv_date_poll_responses, etv_date_poll_notes,
--     comm_recipient_overrides): die Zeile der Dublette wird verworfen, die des Haupt-Kontakts bleibt.
--   * survey_votes: Trigger setzt contact_id immer auf den angemeldeten Benutzer -> Abbruch, falls die Dublette Stimmen hat.
--   * sepa_mandate_audit_log ist append-only -> bleibt unverändert, die Zuordnung alt -> neu steht in kontakt_zusammenfuehrungen.
--   * Kontaktfelder: nur leere Felder des Haupt-Kontakts werden ergänzt (nie überschrieben); Notizen werden angehängt.
--   * App-Login (user_id): wird übernommen, wenn nur die Dublette einen hat; haben beide einen -> Abbruch.
-- Protokoll: public.kontakt_zusammenfuehrungen (alt_id, neu_id, am, details).
-- p_trocken = true: alles wird ausgeführt und am Ende zurückgerollt; Rückgabe = Zusammenfassung.
-- Nur für postgres/service_role ausführbar.

create table if not exists public.kontakt_zusammenfuehrungen (
  id bigserial primary key,
  alt_id uuid not null,
  neu_id uuid not null,
  am timestamptz not null default now(),
  details jsonb
);
create index if not exists kontakt_zusammenfuehrungen_alt_idx on public.kontakt_zusammenfuehrungen (alt_id);
create index if not exists kontakt_zusammenfuehrungen_neu_idx on public.kontakt_zusammenfuehrungen (neu_id);
alter table public.kontakt_zusammenfuehrungen enable row level security;
revoke all on public.kontakt_zusammenfuehrungen from public, anon, authenticated;
grant select on public.kontakt_zusammenfuehrungen to authenticated;
drop policy if exists "Staff lesen Zusammenfuehrungen" on public.kontakt_zusammenfuehrungen;
create policy "Staff lesen Zusammenfuehrungen" on public.kontakt_zusammenfuehrungen
  for select to authenticated using (public.is_rgi_staff());

create or replace function public.kontakte_zusammenfuehren(p_haupt uuid, p_dublette uuid, p_trocken boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
begin
  if p_haupt is null or p_dublette is null or p_haupt = p_dublette then
    raise exception 'Haupt-Kontakt und Dublette müssen verschieden sein';
  end if;
  begin
    v_res := public._kontakte_zusammenfuehren_intern(p_haupt, p_dublette);
    if p_trocken then
      raise exception using errcode = 'RGI01', message = v_res::text;
    end if;
  exception when sqlstate 'RGI01' then
    return jsonb_build_object('trockenlauf', true) || sqlerrm::jsonb;
  end;
  return jsonb_build_object('trockenlauf', false) || v_res;
end;
$$;

create or replace function public._kontakte_zusammenfuehren_intern(p_haupt uuid, p_dublette uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_h public.contacts;
  v_x public.contacts;
  v_d jsonb := '{}'::jsonb;
  v_warn text[] := '{}';
  r record;
  t record;
  v_target uuid;
  v_n int;
  v_max_sort int;
  v_rest jsonb := '{}'::jsonb;
  v_tbl regclass;
begin
  select * into v_h from public.contacts where id = p_haupt for update;
  if not found then raise exception 'Haupt-Kontakt % nicht gefunden', p_haupt; end if;
  select * into v_x from public.contacts where id = p_dublette for update;
  if not found then raise exception 'Dublette % nicht gefunden', p_dublette; end if;

  if v_h.user_id is not null and v_x.user_id is not null then
    raise exception 'Beide Kontakte haben einen App-Login – nicht automatisch zusammenführen';
  end if;

  if exists (select 1 from public.survey_votes where contact_id = p_dublette) then
    raise exception 'Dublette hat Umfrage-Stimmen (survey_votes) – bitte von Hand klären';
  end if;

  -- 1. Eindeutigkeitskonflikte: Zeile der Dublette verwerfen
  delete from public.building_file_visibility x where x.contact_id = p_dublette
    and exists (select 1 from public.building_file_visibility h where h.contact_id = p_haupt and h.file_id = x.file_id);
  get diagnostics v_n = row_count; if v_n > 0 then v_d := v_d || jsonb_build_object('verworfen_building_file_visibility', v_n); end if;

  delete from public.etv_date_poll_responses x where x.contact_id = p_dublette
    and exists (select 1 from public.etv_date_poll_responses h where h.contact_id = p_haupt and h.option_id = x.option_id);
  get diagnostics v_n = row_count; if v_n > 0 then v_d := v_d || jsonb_build_object('verworfen_etv_date_poll_responses', v_n); end if;

  delete from public.etv_date_poll_notes x where x.contact_id = p_dublette
    and exists (select 1 from public.etv_date_poll_notes h where h.contact_id = p_haupt and h.poll_id = x.poll_id);
  get diagnostics v_n = row_count; if v_n > 0 then v_d := v_d || jsonb_build_object('verworfen_etv_date_poll_notes', v_n); end if;

  delete from public.comm_recipient_overrides x where x.contact_id = p_dublette
    and exists (select 1 from public.comm_recipient_overrides h where h.contact_id = p_haupt
      and h.campaign_id = x.campaign_id
      and coalesce(h.assignment_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(x.assignment_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(lower(h.email), '') = coalesce(lower(x.email), ''));
  get diagnostics v_n = row_count; if v_n > 0 then v_d := v_d || jsonb_build_object('verworfen_comm_recipient_overrides', v_n); end if;

  -- 2. Personen
  select coalesce(max(sort_order), 0) into v_max_sort from public.contact_persons where contact_id = p_haupt;
  for r in
    select p.*, array(select w from unnest(regexp_split_to_array(lower(btrim(concat_ws(' ', p.first_name, p.last_name))), '[\s,&]+')) w
                      where w <> '' order by w) as namekey
    from public.contact_persons p where p.contact_id = p_dublette
    order by (p.is_primary is true) desc, p.sort_order nulls last, p.created_at
  loop
    v_target := null;
    if cardinality(r.namekey) > 0 then
      select h.id into v_target from public.contact_persons h
       where h.contact_id = p_haupt
         and array(select w from unnest(regexp_split_to_array(lower(btrim(concat_ws(' ', h.first_name, h.last_name))), '[\s,&]+')) w
                   where w <> '' order by w) = r.namekey
       order by (h.is_primary is true) desc, h.sort_order nulls last, h.created_at
       limit 1;
    else
      -- Person ohne Namen: in die Hauptperson des Haupt-Kontakts
      select h.id into v_target from public.contact_persons h where h.contact_id = p_haupt
       order by (h.is_primary is true) desc, h.sort_order nulls last, h.created_at limit 1;
    end if;

    if v_target is not null then
      update public.contact_phones set person_id = v_target where person_id = r.id;
      update public.contact_emails set person_id = v_target where person_id = r.id;
      update public.contact_bank_accounts set person_id = v_target where person_id = r.id;
      update public.emails set contact_person_id = v_target where contact_person_id = r.id;
      update public.comm_recipients set person_id = v_target where person_id = r.id;
      update public.contact_persons h set
        salutation = coalesce(nullif(btrim(h.salutation), ''), r.salutation),
        position = coalesce(nullif(btrim(h.position), ''), r.position),
        email = coalesce(nullif(btrim(h.email), ''), r.email),
        phone = coalesce(nullif(btrim(h.phone), ''), r.phone),
        notes = case when nullif(btrim(h.notes), '') is null then r.notes
                     when nullif(btrim(r.notes), '') is null or btrim(r.notes) = btrim(h.notes) then h.notes
                     else h.notes || E'\n' || r.notes end,
        onboarding_expectations = coalesce(nullif(btrim(h.onboarding_expectations), ''), r.onboarding_expectations),
        willing_cash_audit = coalesce(h.willing_cash_audit, r.willing_cash_audit),
        updated_at = now()
      where h.id = v_target;
      delete from public.contact_persons where id = r.id;
      v_d := jsonb_set(v_d, '{personen_zusammengelegt}', to_jsonb(coalesce((v_d->>'personen_zusammengelegt')::int, 0) + 1));
    else
      v_max_sort := v_max_sort + 1;
      update public.contact_persons set
        contact_id = p_haupt,
        is_primary = (is_primary is true) and not exists (select 1 from public.contact_persons h where h.contact_id = p_haupt and h.is_primary),
        sort_order = v_max_sort,
        updated_at = now()
      where id = r.id;
      v_d := jsonb_set(v_d, '{personen_umgehaengt}', to_jsonb(coalesce((v_d->>'personen_umgehaengt')::int, 0) + 1));
    end if;
  end loop;

  -- 3. Telefonnummern (normalisiert vergleichen)
  for r in select * from public.contact_phones where contact_id = p_dublette order by created_at loop
    select h.id into v_target from public.contact_phones h
     where h.contact_id = p_haupt
       and public._telefon_norm(h.phone_number) = public._telefon_norm(r.phone_number)
     order by (h.person_id is not null) desc, h.created_at limit 1;
    if v_target is not null and public._telefon_norm(r.phone_number) <> '' then
      update public.contact_phones set note = r.note
       where id = v_target and coalesce(btrim(note), '') = '' and coalesce(btrim(r.note), '') <> '';
      update public.contact_phones set person_id = r.person_id
       where id = v_target and person_id is null and r.person_id is not null;
      delete from public.contact_phones where id = r.id;
      v_d := jsonb_set(v_d, '{telefon_doppelt_verworfen}', to_jsonb(coalesce((v_d->>'telefon_doppelt_verworfen')::int, 0) + 1));
    else
      update public.contact_phones set contact_id = p_haupt where id = r.id;
      v_d := jsonb_set(v_d, '{telefon_umgehaengt}', to_jsonb(coalesce((v_d->>'telefon_umgehaengt')::int, 0) + 1));
    end if;
  end loop;

  -- 4. E-Mails
  for r in select * from public.contact_emails where contact_id = p_dublette order by created_at loop
    select h.id into v_target from public.contact_emails h
     where h.contact_id = p_haupt and lower(btrim(h.email)) = lower(btrim(r.email))
     order by (h.person_id is not null) desc, h.created_at limit 1;
    if v_target is not null then
      update public.contact_emails set note = r.note
       where id = v_target and coalesce(btrim(note), '') = '' and coalesce(btrim(r.note), '') <> '';
      update public.contact_emails set person_id = r.person_id
       where id = v_target and person_id is null and r.person_id is not null;
      delete from public.contact_emails where id = r.id;
      v_d := jsonb_set(v_d, '{email_doppelt_verworfen}', to_jsonb(coalesce((v_d->>'email_doppelt_verworfen')::int, 0) + 1));
    else
      update public.contact_emails set
        contact_id = p_haupt,
        is_primary = (is_primary is true) and not exists (select 1 from public.contact_emails h where h.contact_id = p_haupt and h.is_primary)
      where id = r.id;
      v_d := jsonb_set(v_d, '{email_umgehaengt}', to_jsonb(coalesce((v_d->>'email_umgehaengt')::int, 0) + 1));
    end if;
  end loop;

  -- 5. Bankverbindungen
  for r in select * from public.contact_bank_accounts where contact_id = p_dublette order by created_at loop
    v_target := null;
    if coalesce(btrim(r.iban), '') <> '' then
      select h.id into v_target from public.contact_bank_accounts h
       where h.contact_id = p_haupt
         and upper(regexp_replace(coalesce(h.iban, ''), '\s', '', 'g')) = upper(regexp_replace(r.iban, '\s', '', 'g'))
       order by h.is_default desc nulls last, h.created_at limit 1;
    elsif exists (select 1 from public.contact_bank_accounts h where h.contact_id = p_haupt)
          and coalesce(btrim(r.bic), '') = '' and coalesce(btrim(r.bank_name), '') = '' and r.sepa_mandate_date is null then
      -- leere Bankzeile ohne Inhalt: verwerfen, Verweise auf die Standard-Bankzeile des Haupt-Kontakts
      select h.id into v_target from public.contact_bank_accounts h where h.contact_id = p_haupt
       order by h.is_default desc nulls last, h.created_at limit 1;
    end if;

    if v_target is not null then
      update public.contact_bank_accounts h set
        bic = coalesce(nullif(btrim(h.bic), ''), r.bic),
        bank_name = coalesce(nullif(btrim(h.bank_name), ''), r.bank_name),
        account_holder = coalesce(nullif(btrim(h.account_holder), ''), r.account_holder),
        sepa_mandate_date = coalesce(h.sepa_mandate_date, r.sepa_mandate_date),
        person_id = coalesce(h.person_id, r.person_id),
        updated_at = now()
      where h.id = v_target;
      update public.contact_building_assignments set bank_account_id = v_target where bank_account_id = r.id;
      update public.contact_change_notifications set bank_account_id = v_target where bank_account_id = r.id;
      delete from public.contact_bank_accounts where id = r.id;
      v_d := jsonb_set(v_d, '{bank_doppelt_verworfen}', to_jsonb(coalesce((v_d->>'bank_doppelt_verworfen')::int, 0) + 1));
    else
      update public.contact_bank_accounts set
        contact_id = p_haupt,
        is_default = (is_default is true) and not exists (select 1 from public.contact_bank_accounts h where h.contact_id = p_haupt and h.is_default)
      where id = r.id;
      v_d := jsonb_set(v_d, '{bank_umgehaengt}', to_jsonb(coalesce((v_d->>'bank_umgehaengt')::int, 0) + 1));
    end if;
  end loop;

  -- 6. Gebäude-Zuordnungen: gleiche Einheit/Rolle beim Haupt-Kontakt -> Abbruch (Eigentümer würde sonst doppelt geführt)
  for r in select * from public.contact_building_assignments x where x.contact_id = p_dublette
             and exists (select 1 from public.contact_building_assignments h where h.contact_id = p_haupt
               and h.building_id = x.building_id and coalesce(h.unit_number, '') = coalesce(x.unit_number, '')
               and h.role_in_building is not distinct from x.role_in_building) loop
    raise exception 'Gebäude-Zuordnung doppelt (gleiche Einheit/Rolle) – bitte von Hand klären: %', r.id;
  end loop;

  -- 7. Alle übrigen Verweise auf contacts.id (vollständig aus pg_constraint) + comm_recipient_overrides (ohne FK)
  for t in
    select c.conrelid::regclass as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.contacts'::regclass and cardinality(c.conkey) = 1
    union
    select 'public.comm_recipient_overrides'::regclass, 'contact_id'
  loop
    if t.tbl = 'public.survey_votes'::regclass then continue; end if;
    execute format('update %s set %I = $1 where %I = $2', t.tbl, t.col, t.col) using p_haupt, p_dublette;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_d := jsonb_set(v_d, array['umgehaengt_' || t.tbl::text || '.' || t.col], to_jsonb(v_n));
    end if;
  end loop;

  -- 8. Fehlende Felder am Haupt-Kontakt ergänzen (nie überschreiben)
  if v_x.user_id is not null and v_h.user_id is null then
    update public.contacts set user_id = null where id = p_dublette;
    v_d := v_d || jsonb_build_object('app_login_uebernommen', true);
  end if;
  update public.contacts h set
    user_id = coalesce(h.user_id, v_x.user_id),
    short_name = coalesce(nullif(btrim(h.short_name), ''), v_x.short_name),
    salutation = coalesce(nullif(btrim(h.salutation), ''), v_x.salutation),
    first_name = coalesce(nullif(btrim(h.first_name), ''), v_x.first_name),
    last_name = coalesce(nullif(btrim(h.last_name), ''), v_x.last_name),
    company_name = coalesce(nullif(btrim(h.company_name), ''), v_x.company_name),
    address_street = case when coalesce(btrim(h.address_street), '') || coalesce(btrim(h.address_zip), '') || coalesce(btrim(h.address_city), '') = ''
                          then v_x.address_street else h.address_street end,
    address_zip = case when coalesce(btrim(h.address_street), '') || coalesce(btrim(h.address_zip), '') || coalesce(btrim(h.address_city), '') = ''
                       then v_x.address_zip else h.address_zip end,
    address_city = case when coalesce(btrim(h.address_street), '') || coalesce(btrim(h.address_zip), '') || coalesce(btrim(h.address_city), '') = ''
                        then v_x.address_city else h.address_city end,
    address_lat = case when coalesce(btrim(h.address_street), '') || coalesce(btrim(h.address_zip), '') || coalesce(btrim(h.address_city), '') = ''
                       then v_x.address_lat else h.address_lat end,
    address_lon = case when coalesce(btrim(h.address_street), '') || coalesce(btrim(h.address_zip), '') || coalesce(btrim(h.address_city), '') = ''
                       then v_x.address_lon else h.address_lon end,
    notes = case when nullif(btrim(h.notes), '') is null then v_x.notes
                 when nullif(btrim(v_x.notes), '') is null or btrim(v_x.notes) = btrim(h.notes) then h.notes
                 else h.notes || E'\n[aus zusammengeführtem Kontakt] ' || v_x.notes end,
    trade_notes = case when nullif(btrim(h.trade_notes), '') is null then v_x.trade_notes
                       when nullif(btrim(v_x.trade_notes), '') is null or btrim(v_x.trade_notes) = btrim(h.trade_notes) then h.trade_notes
                       else h.trade_notes || E'\n' || v_x.trade_notes end,
    onboarding_category = coalesce(nullif(btrim(h.onboarding_category), ''), v_x.onboarding_category),
    rating = coalesce(h.rating, v_x.rating),
    last_hired_at = greatest(h.last_hired_at, v_x.last_hired_at),
    suggest_in_onboarding = coalesce(h.suggest_in_onboarding, false) or coalesce(v_x.suggest_in_onboarding, false),
    is_service_provider_pool = h.is_service_provider_pool or v_x.is_service_provider_pool,
    is_emergency_service = h.is_emergency_service or v_x.is_emergency_service,
    service_provider_categories = array(select distinct unnest(h.service_provider_categories || v_x.service_provider_categories)),
    updated_at = now()
  where h.id = p_haupt;

  -- 9. Kontrolle: keine Verweise mehr auf die Dublette (außer append-only Audit-Log)
  for t in
    select c.conrelid::regclass as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.contacts'::regclass and cardinality(c.conkey) = 1
    union
    select 'public.comm_recipient_overrides'::regclass, 'contact_id'
  loop
    execute format('select count(*) from %s where %I = $1', t.tbl, t.col) into v_n using p_dublette;
    if v_n > 0 then
      raise exception 'Noch % Verweise in %.% auf die Dublette', v_n, t.tbl, t.col;
    end if;
  end loop;
  select count(*) into v_n from public.sepa_mandate_audit_log where contact_id = p_dublette;
  if v_n > 0 then
    v_d := v_d || jsonb_build_object('sepa_mandate_audit_log_alt_id_bleibt', v_n);
  end if;

  v_d := v_d || jsonb_build_object('warnungen', to_jsonb(v_warn));

  insert into public.kontakt_zusammenfuehrungen (alt_id, neu_id, details)
  values (p_dublette, p_haupt, v_d || jsonb_build_object('dublette', to_jsonb(v_x)));

  delete from public.contacts where id = p_dublette;

  return jsonb_build_object('haupt', p_haupt, 'dublette', p_dublette) || v_d;
end;
$$;

create or replace function public._telefon_norm(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           coalesce(p, ''), '\(0\)', '', 'g'), '^\s*(\+|00)\s*49', '0'), '^\s*(\+|00)', '00'), '\D', '', 'g'), '^49(\d{9,})$', '0\1')
$$;

revoke all on function public.kontakte_zusammenfuehren(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public._kontakte_zusammenfuehren_intern(uuid, uuid) from public, anon, authenticated;
revoke all on function public._telefon_norm(text) from public, anon;
grant execute on function public.kontakte_zusammenfuehren(uuid, uuid, boolean) to service_role;
grant execute on function public._kontakte_zusammenfuehren_intern(uuid, uuid) to service_role;
